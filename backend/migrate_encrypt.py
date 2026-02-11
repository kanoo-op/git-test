#!/usr/bin/env python3
"""
PostureView 평문 데이터 → Fernet 암호화 마이그레이션 스크립트

사용법:
    # Docker 컨테이너 내부에서 실행
    docker compose exec api python migrate_encrypt.py

    # 또는 로컬에서 직접 실행 (DATABASE_URL, ENCRYPTION_KEY 환경변수 필요)
    ENCRYPTION_KEY=<your-key> DATABASE_URL=<db-url> python migrate_encrypt.py

    # dry-run (실제 변경 없이 대상 확인만)
    docker compose exec api python migrate_encrypt.py --dry-run

기능:
    1. patients 테이블 컬럼 타입 확장 (String → Text)
    2. patients.phone/email/diagnosis/medical_history/notes 암호화
    3. assessments.overall_notes 암호화
    4. posture_photos.data 암호화
    5. 이미 암호화된 데이터 자동 건너뛰기 (멱등성)
"""
import asyncio
import sys

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.config import settings

# ─── Fernet 인스턴스 ───────────────────────────────────────
fernet = Fernet(settings.ENCRYPTION_KEY.encode())

FERNET_PREFIX = "gAAAAA"            # Fernet 토큰은 항상 이 접두사로 시작
FERNET_BYTES_PREFIX = b"gAAAAA"


def is_already_encrypted(value: str | None) -> bool:
    """Fernet 토큰 접두사로 이미 암호화된 값인지 판별"""
    if not value:
        return True  # None/빈값은 처리 불필요 → True 리턴
    return value.startswith(FERNET_PREFIX)


def is_already_encrypted_bytes(data: bytes | None) -> bool:
    if not data:
        return True
    return data[:6] == FERNET_BYTES_PREFIX


def encrypt_str(value: str | None) -> str | None:
    if not value:
        return value
    return fernet.encrypt(value.encode()).decode()


def encrypt_bytes(data: bytes) -> bytes:
    return fernet.encrypt(data)


# ─── 컬럼 확장 DDL ────────────────────────────────────────
COLUMN_ALTERATIONS = [
    "ALTER TABLE patients ALTER COLUMN phone TYPE TEXT",
    "ALTER TABLE patients ALTER COLUMN email TYPE TEXT",
    "ALTER TABLE patients ALTER COLUMN diagnosis TYPE TEXT",
    # medical_history, notes, overall_notes는 이미 Text이므로 생략
]


# ─── 메인 마이그레이션 ─────────────────────────────────────
async def migrate(dry_run: bool = False):
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    print("=" * 60)
    print("PostureView 평문 → 암호화 마이그레이션")
    print(f"  모드: {'DRY-RUN (변경 없음)' if dry_run else '실행'}")
    print(f"  DB: {settings.DATABASE_URL.split('@')[-1]}")
    print("=" * 60)

    async with session_factory() as db:
        # ── Step 1: 컬럼 타입 확장 ──
        print("\n[1/4] 컬럼 타입 확장 (String → Text)...")
        for ddl in COLUMN_ALTERATIONS:
            col_name = ddl.split("COLUMN ")[-1].split(" TYPE")[0]
            if dry_run:
                print(f"  (dry-run) {ddl}")
            else:
                try:
                    await db.execute(text(ddl))
                    await db.commit()
                    print(f"  OK: {col_name} → TEXT")
                except Exception as e:
                    await db.rollback()
                    # 이미 TEXT인 경우 무시
                    if "already" in str(e).lower() or "type" in str(e).lower():
                        print(f"  SKIP: {col_name} (이미 TEXT)")
                    else:
                        print(f"  WARN: {col_name} - {e}")

        # ── Step 2: patients 암호화 ──
        print("\n[2/4] patients 테이블 암호화...")
        fields = ["phone", "email", "diagnosis", "medical_history", "notes"]
        result = await db.execute(text("SELECT id, phone, email, diagnosis, medical_history, notes FROM patients"))
        rows = result.fetchall()
        print(f"  총 {len(rows)}명 환자 발견")

        patient_encrypted = 0
        patient_skipped = 0

        for row in rows:
            pid = row[0]
            values = dict(zip(fields, row[1:]))
            updates = {}

            for field, value in values.items():
                if is_already_encrypted(value):
                    continue
                updates[field] = encrypt_str(value)

            if not updates:
                patient_skipped += 1
                continue

            if dry_run:
                print(f"  (dry-run) 환자 {pid}: {list(updates.keys())} 암호화 예정")
            else:
                set_clauses = ", ".join(f"{k} = :val_{k}" for k in updates)
                params = {f"val_{k}": v for k, v in updates.items()}
                params["pid"] = pid
                await db.execute(
                    text(f"UPDATE patients SET {set_clauses} WHERE id = :pid"),
                    params,
                )
            patient_encrypted += 1

        if not dry_run and patient_encrypted > 0:
            await db.commit()

        print(f"  암호화: {patient_encrypted}명 / 건너뜀: {patient_skipped}명")

        # ── Step 3: assessments.overall_notes 암호화 ──
        print("\n[3/4] assessments.overall_notes 암호화...")
        result = await db.execute(
            text("SELECT id, overall_notes FROM assessments WHERE overall_notes IS NOT NULL AND overall_notes != ''")
        )
        rows = result.fetchall()
        print(f"  총 {len(rows)}개 평가 (overall_notes 존재)")

        assessment_encrypted = 0
        assessment_skipped = 0

        for row in rows:
            aid, overall_notes = row
            if is_already_encrypted(overall_notes):
                assessment_skipped += 1
                continue

            encrypted_val = encrypt_str(overall_notes)

            if dry_run:
                preview = overall_notes[:30] + "..." if len(overall_notes) > 30 else overall_notes
                print(f"  (dry-run) 평가 {aid}: \"{preview}\" 암호화 예정")
            else:
                await db.execute(
                    text("UPDATE assessments SET overall_notes = :val WHERE id = :aid"),
                    {"val": encrypted_val, "aid": aid},
                )
            assessment_encrypted += 1

        if not dry_run and assessment_encrypted > 0:
            await db.commit()

        print(f"  암호화: {assessment_encrypted}개 / 건너뜀: {assessment_skipped}개")

        # ── Step 4: posture_photos.data 암호화 ──
        print("\n[4/4] posture_photos.data 암호화...")
        result = await db.execute(text("SELECT id, data FROM posture_photos"))
        rows = result.fetchall()
        print(f"  총 {len(rows)}개 사진 발견")

        photo_encrypted = 0
        photo_skipped = 0

        for row in rows:
            photo_id, data = row
            if is_already_encrypted_bytes(data):
                photo_skipped += 1
                continue

            encrypted_data = encrypt_bytes(data)
            original_size = len(data)
            encrypted_size = len(encrypted_data)

            if dry_run:
                print(f"  (dry-run) 사진 {photo_id}: {original_size:,}B → ~{encrypted_size:,}B 암호화 예정")
            else:
                await db.execute(
                    text("UPDATE posture_photos SET data = :data WHERE id = :pid"),
                    {"data": encrypted_data, "pid": photo_id},
                )
            photo_encrypted += 1

        if not dry_run and photo_encrypted > 0:
            await db.commit()

        print(f"  암호화: {photo_encrypted}개 / 건너뜀: {photo_skipped}개")

    await engine.dispose()

    # ── 결과 요약 ──
    print("\n" + "=" * 60)
    print("마이그레이션 완료!")
    print(f"  환자 데이터:  {patient_encrypted}건 암호화")
    print(f"  평가 노트:    {assessment_encrypted}건 암호화")
    print(f"  사진 데이터:  {photo_encrypted}건 암호화")
    if dry_run:
        print("\n  ※ DRY-RUN 모드였습니다. 실제 변경은 없습니다.")
        print("  실행하려면 --dry-run 플래그를 제거하세요.")
    else:
        print("\n  ※ 복호화 검증을 권장합니다:")
        print("    docker compose exec api python migrate_encrypt.py --verify")
    print("=" * 60)


# ─── 검증 모드 ──────────────────────────────────────────
async def verify():
    """암호화된 데이터가 정상적으로 복호화되는지 검증"""
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    print("=" * 60)
    print("PostureView 암호화 데이터 검증")
    print("=" * 60)

    errors = 0

    async with session_factory() as db:
        # patients 검증
        print("\n[1/3] patients 필드 복호화 검증...")
        fields = ["phone", "email", "diagnosis", "medical_history", "notes"]
        result = await db.execute(text("SELECT id, name, phone, email, diagnosis, medical_history, notes FROM patients"))
        rows = result.fetchall()

        for row in rows:
            pid, name = row[0], row[1]
            for i, field in enumerate(fields):
                value = row[i + 2]
                if not value:
                    continue
                try:
                    decrypted = fernet.decrypt(value.encode()).decode()
                    print(f"  OK: 환자 '{name}' / {field} → \"{decrypted[:20]}...\"" if len(decrypted) > 20 else f"  OK: 환자 '{name}' / {field} → \"{decrypted}\"")
                except InvalidToken:
                    print(f"  ERROR: 환자 '{name}' / {field} → 복호화 실패! (평문 또는 키 불일치)")
                    errors += 1

        # assessments 검증
        print("\n[2/3] assessments.overall_notes 복호화 검증...")
        result = await db.execute(
            text("SELECT a.id, p.name, a.overall_notes FROM assessments a JOIN patients p ON a.patient_id = p.id WHERE a.overall_notes IS NOT NULL AND a.overall_notes != ''")
        )
        rows = result.fetchall()

        for row in rows:
            aid, patient_name, overall_notes = row
            try:
                decrypted = fernet.decrypt(overall_notes.encode()).decode()
                preview = decrypted[:30] + "..." if len(decrypted) > 30 else decrypted
                print(f"  OK: 평가 {aid} (환자: {patient_name}) → \"{preview}\"")
            except InvalidToken:
                print(f"  ERROR: 평가 {aid} (환자: {patient_name}) → 복호화 실패!")
                errors += 1

        # photos 검증
        print("\n[3/3] posture_photos.data 복호화 검증...")
        result = await db.execute(text("SELECT id, data, mime_type, file_size FROM posture_photos"))
        rows = result.fetchall()

        for row in rows:
            photo_id, data, mime_type, file_size = row
            try:
                decrypted = fernet.decrypt(data)
                print(f"  OK: 사진 {photo_id} → 복호화 {len(decrypted):,}B ({mime_type}), 원본 크기 {file_size:,}B")
                if len(decrypted) != file_size:
                    print(f"    WARN: 크기 불일치 (복호화: {len(decrypted):,}B ≠ file_size: {file_size:,}B)")
            except InvalidToken:
                print(f"  ERROR: 사진 {photo_id} → 복호화 실패!")
                errors += 1

    await engine.dispose()

    print("\n" + "=" * 60)
    if errors == 0:
        print("검증 완료: 모든 데이터 정상 복호화됨")
    else:
        print(f"검증 완료: {errors}개 오류 발견!")
    print("=" * 60)


# ─── 엔트리포인트 ────────────────────────────────────────
if __name__ == "__main__":
    if "--verify" in sys.argv:
        asyncio.run(verify())
    else:
        dry_run = "--dry-run" in sys.argv
        asyncio.run(migrate(dry_run=dry_run))
