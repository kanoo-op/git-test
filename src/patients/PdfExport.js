// PdfExport.js - PDF report generation

import * as storage from '../services/Storage.js';
import { SEV_LABELS, SEV_PDF_COLORS, PROGRESS_LABELS, calculateAge, severityRank, regionSortIndex } from '../utils/helpers.js';
import { captureQuadScreenshot } from '../core/SceneManager.js';
import { applyRegionColors, resetRegionColors } from '../anatomy/Highlights.js';
import { getMappingRegions, PREDEFINED_REGIONS } from '../anatomy/Regions.js';

// ── Korean font loader (cached) ──

let cachedFontBase64 = null;

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
}

let cachedFontFileName = null;

async function loadKoreanFont(doc) {
    if (cachedFontBase64 && cachedFontFileName) {
        doc.addFileToVFS(cachedFontFileName, cachedFontBase64);
        doc.addFont(cachedFontFileName, 'KoreanFont', 'normal');
        doc.addFont(cachedFontFileName, 'KoreanFont', 'bold');
        doc.setFont('KoreanFont', 'normal');
        return true;
    }

    // TTF만 지원 (jsPDF는 OTF/CFF 렌더링 불가)
    const fontPaths = [
        '/fonts/NanumGothic-Regular.ttf',
        '/fonts/NotoSansKR-Regular.ttf',
    ];

    for (const path of fontPaths) {
        try {
            const res = await fetch(path);
            if (!res.ok) continue;
            const fontData = await res.arrayBuffer();
            if (fontData.byteLength < 500000) continue;
            cachedFontBase64 = arrayBufferToBase64(fontData);
            cachedFontFileName = path.split('/').pop();
            doc.addFileToVFS(cachedFontFileName, cachedFontBase64);
            // normal + bold 모두 등록 (setFont(undefined,'bold') 시 폰트 리셋 방지)
            doc.addFont(cachedFontFileName, 'KoreanFont', 'normal');
            doc.addFont(cachedFontFileName, 'KoreanFont', 'bold');
            doc.setFont('KoreanFont', 'normal');
            return true;
        } catch (_) {}
    }

    window.showToast?.('한국어 폰트를 로드하지 못했습니다. PDF에서 한글이 깨질 수 있습니다.', 'warning');
    return false;
}

export async function exportAssessmentPDF(patientId, assessmentId) {
    const patient = storage.getPatient(patientId);
    const assessment = storage.getAssessment(patientId, assessmentId);
    if (!patient || !assessment) return;

    try {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageW = doc.internal.pageSize.getWidth();

        await loadKoreanFont(doc);

        let y = 16;

        // Header
        doc.setFontSize(16);
        doc.setTextColor(50);
        doc.text('PostureView 내원 리포트', 14, y);
        y += 10;
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`생성일: ${new Date().toLocaleDateString('ko-KR')}`, 14, y);
        y += 8;

        // Patient info
        doc.setDrawColor(200);
        doc.line(14, y, pageW - 14, y);
        y += 6;
        doc.setFontSize(12);
        doc.setTextColor(50);
        doc.text(`환자: ${patient.name}`, 14, y);
        y += 6;
        doc.setFontSize(10);
        doc.setTextColor(80);
        const age = patient.dob ? calculateAge(patient.dob) : '-';
        doc.text(`나이: ${age}세 | 성별: ${patient.gender || '-'} | 진단: ${patient.diagnosis || '-'}`, 14, y);
        y += 8;

        // Assessment info
        doc.setFontSize(11);
        doc.setTextColor(50);
        doc.text(`내원일: ${new Date(assessment.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}`, 14, y);
        y += 5;
        if (assessment.summary) {
            doc.text(`요약: ${assessment.summary}`, 14, y);
            y += 5;
        }
        y += 4;

        // Severity table
        const selections = assessment.selections || [];
        if (selections.length > 0) {
            doc.setFontSize(11);
            doc.setFont('KoreanFont', 'bold');
            doc.text('부위별 심각도', 14, y);
            y += 6;
            doc.setFontSize(9);
            doc.setFont('KoreanFont', 'normal');
            doc.setTextColor(100);
            doc.text('부위', 14, y);
            doc.text('조직', 70, y);
            doc.text('심각도', 120, y);
            doc.text('메모', 150, y);
            y += 5;
            doc.setDrawColor(220);
            doc.line(14, y, pageW - 14, y);
            y += 4;
            doc.setTextColor(60);

            // 부위(region) 기준 중복 제거 — 같은 부위는 가장 높은 심각도만 표시
            const uniqueSelections = new Map();
            for (const s of selections) {
                const key = s.region || s.regionKey || s.meshId;
                if (!uniqueSelections.has(key) || severityRank(s.severity) > severityRank(uniqueSelections.get(key).severity)) {
                    uniqueSelections.set(key, s);
                }
            }

            const sortedSelections = [...uniqueSelections.values()].sort(
                (a, b) => regionSortIndex(a.region || a.meshId) - regionSortIndex(b.region || b.meshId)
            );
            for (const s of sortedSelections) {
                if (y > 270) {
                    doc.addPage();
                    y = 20;
                }
                doc.setTextColor(60);
                doc.text(String(s.region || s.meshId || '-').substring(0, 28), 14, y);
                doc.text(String(s.tissue || '-').substring(0, 20), 70, y);
                const sevColor = SEV_PDF_COLORS[s.severity] || [60, 60, 60];
                doc.setTextColor(...sevColor);
                doc.text(SEV_LABELS[s.severity] || s.severity || '-', 120, y);
                doc.setTextColor(60);
                doc.text(String(s.notes || '-').substring(0, 30), 150, y);
                y += 5;
            }
        }

        // SOAP Notes or legacy overallNotes
        const soap = assessment.soapNotes;
        if (soap) {
            y = renderSoapPdfSection(doc, y, pageW, soap);
        } else if (assessment.overallNotes) {
            y += 6;
            if (y > 260) { doc.addPage(); y = 20; }
            doc.setFontSize(11);
            doc.setFont('KoreanFont', 'bold');
            doc.text('전체 소견', 14, y);
            y += 6;
            doc.setFontSize(10);
            doc.setFont('KoreanFont', 'normal');
            const noteLines = doc.splitTextToSize(assessment.overallNotes, pageW - 28);
            doc.text(noteLines, 14, y);
            y += noteLines.length * 5;
        }

        // Posture analysis
        const pa = assessment.postureAnalysis;
        if (pa) {
            y += 6;
            if (y > 260) { doc.addPage(); y = 20; }
            doc.setFontSize(11);
            doc.setFont('KoreanFont', 'bold');
            doc.text('자세 분석 결과', 14, y);
            y += 6;
            doc.setFontSize(10);
            doc.setFont('KoreanFont', 'normal');
            if (pa.metrics) {
                const m = pa.metrics;
                if (m.forwardHead) { doc.text(`전방 두부 각도: ${m.forwardHead.value}° (${SEV_LABELS[m.forwardHead.severity]})`, 14, y); y += 5; }
                if (m.shoulderDiff) { doc.text(`어깨 높이차: ${m.shoulderDiff.value}cm`, 14, y); y += 5; }
                if (m.pelvicTilt) { doc.text(`골반 기울기: ${m.pelvicTilt.value}°`, 14, y); y += 5; }
                if (m.trunkTilt) { doc.text(`체간 측방 기울기: ${m.trunkTilt.value}°`, 14, y); y += 5; }
            }

            if (pa.hasPhoto) {
                const photo = storage.getPosturePhoto(assessmentId);
                if (photo) {
                    y += 4;
                    if (y > 200) { doc.addPage(); y = 20; }
                    try {
                        doc.addImage(photo, 'JPEG', 14, y, 80, 100);
                        y += 104;
                    } catch (e) {
                        // Skip if image can't be added
                    }
                }
            }
        }

        // 3D Quad-view screenshot (증상 부위 하이라이트 적용)
        try {
            const quadImg = captureAssessmentQuadScreenshot(assessment);
            if (quadImg) {
                y += 6;
                if (y > 160) { doc.addPage(); y = 20; }
                doc.setFontSize(11);
                doc.setFont('KoreanFont', 'bold');
                doc.setTextColor(50);
                doc.text('3D 모델 다각도 뷰 (증상 부위 표시)', 14, y);
                y += 6;

                const imgW = pageW - 28;
                const imgH = imgW * 0.6;
                doc.addImage(quadImg, 'PNG', 14, y, imgW, imgH);
                y += imgH + 2;

                // View labels
                doc.setFontSize(8);
                doc.setFont('KoreanFont', 'normal');
                doc.setTextColor(100);
                const halfW = imgW / 2;
                doc.text('전면', 14 + halfW * 0.25, y);
                doc.text('후면', 14 + halfW * 1.25, y);
                doc.text('좌측', 14 + halfW * 0.25, y + 4);
                doc.text('우측', 14 + halfW * 1.25, y + 4);
                y += 8;
            }
        } catch (e) {
            // Skip quad screenshot if 3D model not available
        }

        // Footer
        y += 10;
        if (y > 275) { doc.addPage(); y = 20; }
        doc.setDrawColor(200);
        doc.line(14, y, pageW - 14, y);
        y += 5;
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(`PostureView Report | ${new Date().toLocaleDateString('ko-KR')} | This report is for clinical reference only`, 14, y);

        // Save
        const safeName = patient.name.replace(/[^a-zA-Z0-9가-힣]/g, '_');
        doc.save(`PostureView-${safeName}-${new Date(assessment.date).toISOString().slice(0, 10)}.pdf`);
        window.showToast('PDF 리포트가 생성되었습니다.', 'success');
    } catch (err) {
        console.error('PDF export error:', err);
        window.showToast('PDF 생성 실패: ' + err.message, 'error');
    }
}

// ── Progress Report PDF ──

export async function exportProgressPDF(patientId) {
    const patient = storage.getPatient(patientId);
    if (!patient) return;
    const assessments = (patient.visits || []).slice().sort((a, b) => a.date - b.date);
    if (assessments.length === 0) {
        window.showToast?.('내원 기록이 없습니다.', 'warning');
        return;
    }

    try {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageW = doc.internal.pageSize.getWidth();

        await loadKoreanFont(doc);

        let y = 16;

        // Header
        doc.setFontSize(16);
        doc.setTextColor(50);
        doc.text('PostureView 경과 리포트', 14, y);
        y += 10;
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`생성일: ${new Date().toLocaleDateString('ko-KR')}`, 14, y);
        y += 8;

        // Patient info
        doc.setDrawColor(200);
        doc.line(14, y, pageW - 14, y);
        y += 6;
        doc.setFontSize(12);
        doc.setTextColor(50);
        doc.text(`환자: ${patient.name}`, 14, y);
        y += 6;
        doc.setFontSize(10);
        doc.setTextColor(80);
        const age = patient.dob ? calculateAge(patient.dob) : '-';
        doc.text(`나이: ${age}세 | 성별: ${patient.gender || '-'} | 진단: ${patient.diagnosis || '-'}`, 14, y);
        y += 10;

        // Summary stats
        const first = assessments[0];
        const last = assessments[assessments.length - 1];
        const firstDate = new Date(first.date).toLocaleDateString('ko-KR');
        const lastDate = new Date(last.date).toLocaleDateString('ko-KR');
        const daysBetween = Math.round((last.date - first.date) / (1000 * 60 * 60 * 24));

        doc.setFontSize(11);
        doc.setFont('KoreanFont', 'bold');
        doc.text('내원 요약', 14, y);
        y += 6;
        doc.setFontSize(10);
        doc.setFont('KoreanFont', 'normal');
        doc.text(`내원 기간: ${firstDate} ~ ${lastDate} (${daysBetween}일)`, 14, y); y += 5;
        doc.text(`총 내원 횟수: ${assessments.length}회`, 14, y); y += 8;

        // Severity comparison table
        const firstSevMap = buildSevMap(first);
        const lastSevMap = buildSevMap(last);
        const allRegions = new Set([...firstSevMap.keys(), ...lastSevMap.keys()]);

        if (allRegions.size > 0) {
            doc.setFontSize(11);
            doc.setFont('KoreanFont', 'bold');
            doc.text('부위별 심각도 변화', 14, y);
            y += 6;
            doc.setFontSize(9);
            doc.setFont('KoreanFont', 'normal');
            doc.setTextColor(100);
            doc.text('부위', 14, y);
            doc.text('첫 내원', 80, y);
            doc.text('최근 내원', 120, y);
            doc.text('변화', 165, y);
            y += 5;
            doc.setDrawColor(220);
            doc.line(14, y, pageW - 14, y);
            y += 4;
            doc.setTextColor(60);

            const sortedRegions = [...allRegions].sort(
                (a, b) => regionSortIndex(a) - regionSortIndex(b)
            );
            for (const region of sortedRegions) {
                if (y > 270) { doc.addPage(); y = 20; }
                const fs = firstSevMap.get(region) || 'normal';
                const ls = lastSevMap.get(region) || 'normal';
                const fr = severityRank(fs);
                const lr = severityRank(ls);
                const change = lr < fr ? '↓ 호전' : lr > fr ? '↑ 악화' : '→ 유지';
                doc.setTextColor(60);
                doc.text(String(region).substring(0, 30), 14, y);
                const fsColor = SEV_PDF_COLORS[fs] || [60, 60, 60];
                doc.setTextColor(...fsColor);
                doc.text(SEV_LABELS[fs] || fs, 80, y);
                const lsColor = SEV_PDF_COLORS[ls] || [60, 60, 60];
                doc.setTextColor(...lsColor);
                doc.text(SEV_LABELS[ls] || ls, 120, y);
                doc.setTextColor(60);
                doc.text(change, 165, y);
                y += 5;
            }
        }

        // Latest SOAP Plan
        if (last.soapNotes && last.soapNotes.plan) {
            y += 6;
            if (y > 260) { doc.addPage(); y = 20; }
            doc.setFontSize(11);
            doc.setFont('KoreanFont', 'bold');
            doc.setTextColor(50);
            doc.text('최근 치료 계획 (Plan)', 14, y);
            y += 6;
            doc.setFontSize(10);
            doc.setFont('KoreanFont', 'normal');
            doc.setTextColor(60);
            const p = last.soapNotes.plan;
            const planItems = [];
            if (p.treatment) planItems.push(`치료 계획: ${p.treatment}`);
            if (p.hep) planItems.push(`가정 운동: ${p.hep}`);
            if (p.frequency) planItems.push(`치료 빈도: ${p.frequency}`);
            if (p.precautions) planItems.push(`주의사항: ${p.precautions}`);
            for (const line of planItems) {
                if (y > 270) { doc.addPage(); y = 20; }
                const wrapped = doc.splitTextToSize(line, pageW - 28);
                doc.text(wrapped, 14, y);
                y += wrapped.length * 5;
            }
        }

        // Footer
        y += 10;
        if (y > 275) { doc.addPage(); y = 20; }
        doc.setDrawColor(200);
        doc.line(14, y, pageW - 14, y);
        y += 5;
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(`PostureView Progress Report | ${new Date().toLocaleDateString('ko-KR')} | This report is for clinical reference only`, 14, y);

        const safeName = patient.name.replace(/[^a-zA-Z0-9가-힣]/g, '_');
        doc.save(`PostureView-경과-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
        window.showToast?.('경과 리포트 PDF가 생성되었습니다.', 'success');
    } catch (err) {
        console.error('Progress PDF error:', err);
        window.showToast?.('PDF 생성 실패: ' + err.message, 'error');
    }
}

// ── Referral Report PDF ──

export async function exportReferralPDF(patientId, referralData) {
    const patient = storage.getPatient(patientId);
    if (!patient) return;

    const { purpose = '', destination = '' } = referralData || {};

    try {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageW = doc.internal.pageSize.getWidth();

        await loadKoreanFont(doc);

        let y = 16;

        // Header
        doc.setFontSize(18);
        doc.setTextColor(50);
        doc.text('의 뢰 서', pageW / 2, y, { align: 'center' });
        y += 12;
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`작성일: ${new Date().toLocaleDateString('ko-KR')}`, 14, y);
        y += 8;

        // Referral destination
        if (destination) {
            doc.setDrawColor(200);
            doc.line(14, y, pageW - 14, y);
            y += 6;
            doc.setFontSize(11);
            doc.setTextColor(50);
            doc.text(`수신: ${destination}`, 14, y);
            y += 8;
        }

        // Patient info
        doc.setDrawColor(200);
        doc.line(14, y, pageW - 14, y);
        y += 6;
        doc.setFontSize(12);
        doc.setFont('KoreanFont', 'bold');
        doc.setTextColor(50);
        doc.text('환자 정보', 14, y);
        y += 7;
        doc.setFontSize(10);
        doc.setFont('KoreanFont', 'normal');
        doc.setTextColor(60);

        const age = patient.dob ? calculateAge(patient.dob) : '-';
        const gender = patient.gender || '-';
        doc.text(`성명: ${patient.name}`, 14, y); y += 5;
        doc.text(`나이: ${age}세`, 14, y); y += 5;
        doc.text(`성별: ${gender}`, 14, y); y += 5;
        if (patient.diagnosis) { doc.text(`진단: ${patient.diagnosis}`, 14, y); y += 5; }
        y += 4;

        // Latest assessment summary
        const assessments = (patient.visits || []).slice().sort((a, b) => b.date - a.date);
        const latest = assessments[0];

        if (latest) {
            doc.setFontSize(12);
            doc.setFont('KoreanFont', 'bold');
            doc.setTextColor(50);
            doc.text('최근 내원 요약', 14, y);
            y += 7;
            doc.setFontSize(10);
            doc.setFont('KoreanFont', 'normal');
            doc.setTextColor(60);
            doc.text(`내원일: ${new Date(latest.date).toLocaleDateString('ko-KR')}`, 14, y); y += 5;

            const sevMap = buildSevMap(latest);
            const counts = { normal: 0, mild: 0, moderate: 0, severe: 0 };
            for (const [, sev] of sevMap) { if (counts[sev] !== undefined) counts[sev]++; }
            const dist = Object.entries(SEV_LABELS).filter(([k]) => counts[k] > 0).map(([k, l]) => `${l} ${counts[k]}`).join(', ');
            if (dist) { doc.text(`심각도 분포: ${dist}`, 14, y); y += 5; }
            doc.text(`총 내원 횟수: ${assessments.length}회`, 14, y); y += 6;

            // SOAP summary
            if (latest.soapNotes) {
                y = renderSoapPdfSection(doc, y, pageW, latest.soapNotes);
            }
        }

        // Referral purpose
        y += 4;
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(12);
        doc.setFont('KoreanFont', 'bold');
        doc.setTextColor(50);
        doc.text('의뢰 목적', 14, y);
        y += 7;
        doc.setFontSize(10);
        doc.setFont('KoreanFont', 'normal');
        doc.setTextColor(60);
        const purposeLines = doc.splitTextToSize(purpose || '-', pageW - 28);
        doc.text(purposeLines, 14, y);
        y += purposeLines.length * 5 + 6;

        // Signature area
        if (y > 250) { doc.addPage(); y = 20; }
        y += 10;
        doc.setDrawColor(200);
        doc.line(14, y, pageW - 14, y);
        y += 10;
        doc.setFontSize(10);
        doc.setTextColor(80);
        doc.text('의뢰 의료인:', 14, y);
        doc.line(50, y + 1, 120, y + 1);
        y += 8;
        doc.text('서명:', 14, y);
        doc.line(50, y + 1, 120, y + 1);
        y += 8;
        doc.text('날짜:', 14, y);
        doc.text(new Date().toLocaleDateString('ko-KR'), 50, y);
        y += 12;

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(`PostureView Referral Report | ${new Date().toLocaleDateString('ko-KR')} | This report is for clinical reference only`, 14, y);

        const safeName = patient.name.replace(/[^a-zA-Z0-9가-힣]/g, '_');
        doc.save(`PostureView-의뢰서-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`);
        window.showToast?.('의뢰 리포트 PDF가 생성되었습니다.', 'success');
    } catch (err) {
        console.error('Referral PDF error:', err);
        window.showToast?.('PDF 생성 실패: ' + err.message, 'error');
    }
}

// ── Helpers ──

/**
 * 평가 데이터의 증상 부위를 3D 모델에 하이라이트 적용 후 4분할 캡처
 */
function captureAssessmentQuadScreenshot(assessment) {
    // selections에서 regionKey별 심각도 추출
    const regionSeverityMap = {};
    for (const sel of (assessment.selections || [])) {
        if (sel.regionKey && sel.severity && sel.severity !== 'normal') {
            // 같은 부위 중 더 높은 심각도 유지
            const existing = regionSeverityMap[sel.regionKey];
            if (!existing || severityRank(sel.severity) > severityRank(existing)) {
                regionSeverityMap[sel.regionKey] = sel.severity;
            }
        }
    }

    // 매핑 데이터에서 메쉬/바운드 정보 가져와서 activeRegions 구성
    const mappingRegions = getMappingRegions();
    const activeRegions = [];

    for (const [regionKey, sev] of Object.entries(regionSeverityMap)) {
        const regionData = mappingRegions[regionKey] || {};
        const predefined = PREDEFINED_REGIONS.find(r => r.id === regionKey);

        activeRegions.push({
            side: predefined ? predefined.side : null,
            xMin: regionData.xMin ?? null,
            xMax: regionData.xMax ?? null,
            yMin: regionData.yMin ?? null,
            yMax: regionData.yMax ?? null,
            meshes: regionData.meshes || [],
            severity: sev
        });
    }

    // 하이라이트 적용 → 캡처 → 리셋
    if (activeRegions.length > 0) {
        applyRegionColors(activeRegions);
    }

    const dataUrl = captureQuadScreenshot();

    resetRegionColors();

    return dataUrl;
}

function buildSevMap(assessment) {
    const map = new Map();
    for (const s of (assessment.selections || [])) {
        const key = s.region || s.meshId || s.regionKey;
        if (!key) continue;
        if (!map.has(key) || severityRank(s.severity) > severityRank(map.get(key))) {
            map.set(key, s.severity);
        }
    }
    return map;
}

function renderSoapPdfSection(doc, y, pageW, soap) {
    const sections = [
        {
            title: 'S - Subjective (주관적 소견)',
            items: () => {
                const s = soap.subjective || {};
                const lines = [];
                if (s.chiefComplaint) lines.push(`주호소: ${s.chiefComplaint}`);
                if (s.painScale > 0) lines.push(`통증 척도 (VAS): ${s.painScale}/10`);
                if (s.symptomDescription) lines.push(`증상: ${s.symptomDescription}`);
                if (s.painLocation) lines.push(`통증 위치: ${s.painLocation}`);
                if (s.onset) lines.push(`발병 시기: ${s.onset}`);
                if (s.aggravating) lines.push(`악화 요인: ${s.aggravating}`);
                if (s.relieving) lines.push(`완화 요인: ${s.relieving}`);
                return lines;
            }
        },
        {
            title: 'O - Objective (객관적 소견)',
            items: () => {
                const o = soap.objective || {};
                const lines = [];
                if (o.autoFindings) lines.push(`자동 소견: ${o.autoFindings}`);
                if (o.rom) lines.push(`ROM: ${o.rom}`);
                if (o.mmt) lines.push(`MMT: ${o.mmt}`);
                if (o.specialTests) lines.push(`특수 검사: ${o.specialTests}`);
                if (o.palpation) lines.push(`촉진: ${o.palpation}`);
                if (o.gait) lines.push(`보행: ${o.gait}`);
                if (o.additionalFindings) lines.push(`추가 소견: ${o.additionalFindings}`);
                return lines;
            }
        },
        {
            title: 'A - Assessment (평가)',
            items: () => {
                const a = soap.assessment || {};
                const lines = [];
                if (a.clinicalImpression) lines.push(`임상 소견: ${a.clinicalImpression}`);
                if (a.progressLevel) lines.push(`진행 상태: ${PROGRESS_LABELS[a.progressLevel] || a.progressLevel}`);
                if (a.functionalLevel) lines.push(`기능 수준: ${a.functionalLevel}`);
                if (a.goals) lines.push(`목표: ${a.goals}`);
                return lines;
            }
        },
        {
            title: 'P - Plan (계획)',
            items: () => {
                const p = soap.plan || {};
                const lines = [];
                if (p.treatment) lines.push(`치료 계획: ${p.treatment}`);
                if (p.hep) lines.push(`가정 운동: ${p.hep}`);
                if (p.frequency) lines.push(`치료 빈도: ${p.frequency}`);
                if (p.duration) lines.push(`치료 기간: ${p.duration}`);
                if (p.nextVisit) lines.push(`다음 방문: ${p.nextVisit}`);
                if (p.precautions) lines.push(`주의사항: ${p.precautions}`);
                if (p.referral) lines.push(`의뢰: ${p.referral}`);
                return lines;
            }
        }
    ];

    for (const section of sections) {
        const items = section.items();
        if (items.length === 0) continue;

        y += 6;
        if (y > 260) { doc.addPage(); y = 20; }
        doc.setFontSize(11);
        doc.setFont('KoreanFont', 'bold');
        doc.setTextColor(50);
        doc.text(section.title, 14, y);
        y += 6;
        doc.setFontSize(10);
        doc.setFont('KoreanFont', 'normal');
        doc.setTextColor(60);
        for (const line of items) {
            if (y > 270) { doc.addPage(); y = 20; }
            const wrapped = doc.splitTextToSize(line, pageW - 28);
            doc.text(wrapped, 14, y);
            y += wrapped.length * 5;
        }
    }

    return y;
}

// Forward aliases (new naming convention)
export { exportAssessmentPDF as exportVisitPDF };
