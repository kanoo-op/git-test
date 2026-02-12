// PdfExport.js - PDF report generation

import * as storage from '../services/Storage.js';
import { SEV_LABELS, PROGRESS_LABELS, calculateAge, severityRank } from '../utils/helpers.js';

export async function exportAssessmentPDF(patientId, assessmentId) {
    const patient = storage.getPatient(patientId);
    const assessment = storage.getAssessment(patientId, assessmentId);
    if (!patient || !assessment) return;

    try {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageW = doc.internal.pageSize.getWidth();

        // Load Korean font
        let koreanFontLoaded = false;
        try {
            const fontRes = await fetch('/fonts/NotoSansKR-Regular.ttf');
            if (fontRes.ok) {
                const fontData = await fontRes.arrayBuffer();
                const base64 = btoa(String.fromCharCode(...new Uint8Array(fontData)));
                doc.addFileToVFS('NotoSansKR-Regular.ttf', base64);
                doc.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
                doc.setFont('NotoSansKR');
                koreanFontLoaded = true;
            }
        } catch (_) { /* Fallback to default font */ }
        if (!koreanFontLoaded) {
            window.showToast?.('한국어 폰트를 로드하지 못했습니다. PDF에서 한글이 깨질 수 있습니다.', 'warning');
        }

        let y = 16;

        // Header
        doc.setFontSize(16);
        doc.setTextColor(50);
        doc.text('PostureView 평가 리포트', 14, y);
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
        doc.text(`평가일: ${new Date(assessment.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}`, 14, y);
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
            doc.setFont(undefined, 'bold');
            doc.text('부위별 심각도', 14, y);
            y += 6;
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
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

            // Deduplicate by meshId
            const uniqueSelections = new Map();
            for (const s of selections) {
                if (!uniqueSelections.has(s.meshId) || severityRank(s.severity) > severityRank(uniqueSelections.get(s.meshId).severity)) {
                    uniqueSelections.set(s.meshId, s);
                }
            }

            for (const [, s] of uniqueSelections) {
                if (y > 270) {
                    doc.addPage();
                    y = 20;
                }
                doc.text(String(s.region || s.meshId || '-').substring(0, 28), 14, y);
                doc.text(String(s.tissue || '-').substring(0, 20), 70, y);
                doc.text(SEV_LABELS[s.severity] || s.severity || '-', 120, y);
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
            doc.setFont(undefined, 'bold');
            doc.text('전체 소견', 14, y);
            y += 6;
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
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
            doc.setFont(undefined, 'bold');
            doc.text('자세 분석 결과', 14, y);
            y += 6;
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
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
    const assessments = (patient.assessments || []).slice().sort((a, b) => a.date - b.date);
    if (assessments.length === 0) {
        window.showToast?.('평가 기록이 없습니다.', 'warning');
        return;
    }

    try {
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageW = doc.internal.pageSize.getWidth();

        let koreanFontLoaded = false;
        try {
            const fontRes = await fetch('/fonts/NotoSansKR-Regular.ttf');
            if (fontRes.ok) {
                const fontData = await fontRes.arrayBuffer();
                const base64 = btoa(String.fromCharCode(...new Uint8Array(fontData)));
                doc.addFileToVFS('NotoSansKR-Regular.ttf', base64);
                doc.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
                doc.setFont('NotoSansKR');
                koreanFontLoaded = true;
            }
        } catch (_) {}
        if (!koreanFontLoaded) {
            window.showToast?.('한국어 폰트를 로드하지 못했습니다. PDF에서 한글이 깨질 수 있습니다.', 'warning');
        }

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
        doc.setFont(undefined, 'bold');
        doc.text('평가 요약', 14, y);
        y += 6;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`평가 기간: ${firstDate} ~ ${lastDate} (${daysBetween}일)`, 14, y); y += 5;
        doc.text(`총 평가 횟수: ${assessments.length}회`, 14, y); y += 8;

        // Severity comparison table
        const firstSevMap = buildSevMap(first);
        const lastSevMap = buildSevMap(last);
        const allRegions = new Set([...firstSevMap.keys(), ...lastSevMap.keys()]);

        if (allRegions.size > 0) {
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text('부위별 심각도 변화', 14, y);
            y += 6;
            doc.setFontSize(9);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(100);
            doc.text('부위', 14, y);
            doc.text('첫 평가', 80, y);
            doc.text('최근 평가', 120, y);
            doc.text('변화', 165, y);
            y += 5;
            doc.setDrawColor(220);
            doc.line(14, y, pageW - 14, y);
            y += 4;
            doc.setTextColor(60);

            for (const region of allRegions) {
                if (y > 270) { doc.addPage(); y = 20; }
                const fs = firstSevMap.get(region) || 'normal';
                const ls = lastSevMap.get(region) || 'normal';
                const fr = severityRank(fs);
                const lr = severityRank(ls);
                const change = lr < fr ? '↓ 호전' : lr > fr ? '↑ 악화' : '→ 유지';
                doc.text(String(region).substring(0, 30), 14, y);
                doc.text(SEV_LABELS[fs] || fs, 80, y);
                doc.text(SEV_LABELS[ls] || ls, 120, y);
                doc.text(change, 165, y);
                y += 5;
            }
        }

        // Latest SOAP Plan
        if (last.soapNotes && last.soapNotes.plan) {
            y += 6;
            if (y > 260) { doc.addPage(); y = 20; }
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(50);
            doc.text('최근 치료 계획 (Plan)', 14, y);
            y += 6;
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
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

        let koreanFontLoaded = false;
        try {
            const fontRes = await fetch('/fonts/NotoSansKR-Regular.ttf');
            if (fontRes.ok) {
                const fontData = await fontRes.arrayBuffer();
                const base64 = btoa(String.fromCharCode(...new Uint8Array(fontData)));
                doc.addFileToVFS('NotoSansKR-Regular.ttf', base64);
                doc.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
                doc.setFont('NotoSansKR');
                koreanFontLoaded = true;
            }
        } catch (_) {}
        if (!koreanFontLoaded) {
            window.showToast?.('한국어 폰트를 로드하지 못했습니다. PDF에서 한글이 깨질 수 있습니다.', 'warning');
        }

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
        doc.setFont(undefined, 'bold');
        doc.setTextColor(50);
        doc.text('환자 정보', 14, y);
        y += 7;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(60);

        const age = patient.dob ? calculateAge(patient.dob) : '-';
        const gender = patient.gender || '-';
        doc.text(`성명: ${patient.name}`, 14, y); y += 5;
        doc.text(`나이: ${age}세`, 14, y); y += 5;
        doc.text(`성별: ${gender}`, 14, y); y += 5;
        if (patient.diagnosis) { doc.text(`진단: ${patient.diagnosis}`, 14, y); y += 5; }
        y += 4;

        // Latest assessment summary
        const assessments = (patient.assessments || []).slice().sort((a, b) => b.date - a.date);
        const latest = assessments[0];

        if (latest) {
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(50);
            doc.text('최근 평가 요약', 14, y);
            y += 7;
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(60);
            doc.text(`평가일: ${new Date(latest.date).toLocaleDateString('ko-KR')}`, 14, y); y += 5;

            const sevMap = buildSevMap(latest);
            const counts = { normal: 0, mild: 0, moderate: 0, severe: 0 };
            for (const [, sev] of sevMap) { if (counts[sev] !== undefined) counts[sev]++; }
            const dist = Object.entries(SEV_LABELS).filter(([k]) => counts[k] > 0).map(([k, l]) => `${l} ${counts[k]}`).join(', ');
            if (dist) { doc.text(`심각도 분포: ${dist}`, 14, y); y += 5; }
            doc.text(`총 평가 횟수: ${assessments.length}회`, 14, y); y += 6;

            // SOAP summary
            if (latest.soapNotes) {
                y = renderSoapPdfSection(doc, y, pageW, latest.soapNotes);
            }
        }

        // Referral purpose
        y += 4;
        if (y > 240) { doc.addPage(); y = 20; }
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(50);
        doc.text('의뢰 목적', 14, y);
        y += 7;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
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
        doc.setFont(undefined, 'bold');
        doc.setTextColor(50);
        doc.text(section.title, 14, y);
        y += 6;
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
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
