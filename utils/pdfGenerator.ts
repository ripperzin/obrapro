
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Project, STAGE_NAMES } from '../types';

// Extend jsPDF type to include autoTable
interface jsPDFWithAutoTable extends jsPDF {
    lastAutoTable?: {
        finalY: number;
    };
}

export const generateProjectPDF = (project: Project, userName: string) => {
    const doc = new jsPDF() as jsPDFWithAutoTable;
    const pageWidth = doc.internal.pageSize.width;
    const today = new Date().toLocaleDateString('pt-BR');

    // --- Header ---
    // Background Header
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(0, 0, pageWidth, 40, 'F');

    // Logo / Title
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('OBRA PRO', 15, 20);

    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('Relatório de Status do Projeto', 15, 28);

    // Date align right
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`Gerado em: ${today}`, pageWidth - 15, 20, { align: 'right' });
    doc.text(`Por: ${userName}`, pageWidth - 15, 26, { align: 'right' });

    // --- Project Info ---
    let cursorY = 55;

    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text(project.name.toUpperCase(), 15, cursorY);

    cursorY += 10;
    doc.setFontSize(10);
    doc.setTextColor(100);

    // Grid layout for basic info
    doc.setFont('helvetica', 'bold');
    doc.text(`Progresso: ${project.progress}% (${STAGE_NAMES[project.progress]})`, 15, cursorY);

    if (project.startDate) {
        doc.text(`Início: ${new Date(project.startDate + 'T00:00:00').toLocaleDateString('pt-BR')}`, 100, cursorY);
    }

    cursorY += 6;
    if (project.deliveryDate) {
        doc.text(`Entrega Prevista: ${new Date(project.deliveryDate + 'T00:00:00').toLocaleDateString('pt-BR')}`, 100, cursorY);
    }
    doc.text(`Unidades: ${project.unitCount}`, 15, cursorY);

    // --- Financial Summary ---
    cursorY += 15;
    doc.setDrawColor(200);
    doc.line(15, cursorY, pageWidth - 15, cursorY);
    cursorY += 10;

    doc.setFontSize(12);
    doc.setTextColor(30, 41, 59);
    doc.text('Resumo Financeiro', 15, cursorY);

    cursorY += 10;

    // Calculate totals
    const totalCost = project.units.reduce((acc, u) => acc + u.cost, 0);
    const totalSales = project.units.reduce((acc, u) => acc + (u.saleValue || 0), 0);
    const totalExpenses = project.expenses.reduce((acc, e) => acc + e.value, 0);
    const estimatedSales = project.units.reduce((acc, u) => acc + (u.valorEstimadoVenda || 0), 0);

    const saldo = totalCost - totalExpenses;
    const soldUnits = project.units.filter(u => u.status === 'Sold').length;

    const financialData = [
        ['Orçamento Total:', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCost)],
        ['Total Gasto (Realizado):', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalExpenses)],
        ['Saldo Disponível:', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldo)],
        ['', ''],
        ['Vendas Realizadas:', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalSales)],
        ['Potencial de Venda:', new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(estimatedSales)],
        ['Unidades Vendidas:', `${soldUnits} / ${project.unitCount}`],
    ];

    autoTable(doc, {
        startY: cursorY,
        head: [],
        body: financialData,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: 2 },
        columnStyles: {
            0: { fontStyle: 'bold', cellWidth: 80 },
            1: { cellWidth: 60 }
        }
    });

    cursorY = (doc as any).lastAutoTable.finalY + 15;

    // --- Budget Details (Macros) ---
    if (project.budget && project.budget.macros && project.budget.macros.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Detalhamento do Orçamento', 15, cursorY);
        cursorY += 5;

        const budgetData = project.budget.macros
            .sort((a: any, b: any) => a.displayOrder - b.displayOrder)
            .map((m: any) => {
                const percent = m.estimatedValue > 0 ? (m.spentValue / m.estimatedValue) * 100 : 0;
                return [
                    m.name,
                    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(m.estimatedValue),
                    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(m.spentValue),
                    `${percent.toFixed(0)}%`
                ];
            });

        autoTable(doc, {
            startY: cursorY,
            head: [['Macro Etapa', 'Planejado', 'Executado', '% Uso']],
            body: budgetData,
            theme: 'grid',
            headStyles: { fillColor: [30, 41, 59] },
            styles: { fontSize: 9 }
        });

        cursorY = (doc as any).lastAutoTable.finalY + 15;
    }

    // --- Expenses Table (Full) ---
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Extrato Completo de Despesas', 15, cursorY);
    cursorY += 5;

    // Sort expenses by date descending
    const allExpenses = [...project.expenses]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map(e => [
            new Date(e.date + 'T00:00:00').toLocaleDateString('pt-BR'),
            e.description,
            e.userName || '-',
            new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(e.value)
        ]);

    autoTable(doc, {
        startY: cursorY,
        head: [['Data', 'Descrição', 'Usuário', 'Valor']],
        body: allExpenses,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 9 }
    });

    let finalY: number = (doc as any).lastAutoTable?.finalY || cursorY;

    // Add Page Numbers
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Página ${i} de ${pageCount}`, pageWidth - 20, doc.internal.pageSize.height - 10, { align: 'right' });
        doc.text('Obra Pro - Sistema de Gestão', 15, doc.internal.pageSize.height - 10);
    }

    // Save the PDF
    doc.save(`Relatorio_${project.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
};
