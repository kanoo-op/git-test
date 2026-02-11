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
        try {
            const fontRes = await fetch('/fonts/NotoSansKR-Regular.ttf');
            if (fontRes.ok) {
                const fontData = await fontRes.arrayBuffer();
                const base64 = btoa(String.fromCharCode(...new Uint8Array(fontData)));
                doc.addFileToVFS('NotoSansKR-Regular.ttf', base64);
                doc.addFont('NotoSansKR-Regular.ttf', 'NotoSansKR', 'normal');
                doc.setFont('NotoSansKR');
            }
        } catch (_) { /* Fallback to default font */ }

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
