// src/pdf/exportadoresPagos.js
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/* ========= Helpers ========== */
const n = (v) => {
  const x = typeof v === 'number' ? v : parseFloat(v || 0);
  return Number.isFinite(x) ? x : 0;
};

const toMoney = (val) =>
  (typeof val === 'number' ? val : parseFloat(val || 0))
    .toLocaleString('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 2 });

const sanitize = (s) => String(s || '').replace(/[^\w\- .]/g, '_');

function createDoc() {
  // Carta en puntos: 612 x 792 pt
  return new jsPDF({ unit: 'pt', format: 'letter' });
}

/* ========= Header / Footer (estilo cuadre) ========== */
const HEADER_HEIGHT = 66;

const addHeader = (pdf, { title, fecha, subtitulo }) => {
  const w = pdf.internal.pageSize.getWidth();

  // Franja superior
  pdf.setFillColor(245, 248, 252);
  pdf.rect(0, 0, w, HEADER_HEIGHT, 'F');

  // Título
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(33, 37, 41);
  pdf.setFontSize(18);
  pdf.text(title || '', 40, 32);

  // Línea secundaria
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(90, 90, 90);
  if (fecha) pdf.text(`Fecha: ${fecha}`, 40, 50);
  if (subtitulo) pdf.text(subtitulo, w - 40, 50, { align: 'right' });
};

const addFooterPageNumbers = (pdf) => {
  const pageCount = pdf.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i);
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    pdf.setFontSize(9);
    pdf.setTextColor(130, 130, 130);
    pdf.text(`Página ${i} de ${pageCount}`, w - 40, h - 12, { align: 'right' });
  }
};

/* ========= EXPORTADORES ========== */

/**
 * PDF AGRUPADO por filtros (fecha/sucursal) con TODAS las sucursales "seguidas".
 * - Título: "Reporte de Pagos en Efectivo - {fecha}"
 * - Encabezado se redibuja en cada página (sin traslapes)
 * - Por cada sucursal: subtítulo "Sucursal: …" y tabla (Descripción, Cantidad, No. de ref.)
 * - Totales por sucursal (Total utilizado, Caja chica usada, Sobrante para mañana)
 */
export function exportPagosGroupedPdf(docs, sucursalesMap = {}, nombre = 'Pagos_Agrupados') {
  const pdf = createDoc();

  // Fecha para el título (se asume filtrado por fecha en UI)
  const fecha = docs?.[0]?.fecha || '';
  const headerTitle = `Reporte de Pagos en Efectivo - ${fecha || ''}`;

  // Dibujar header de portada
  addHeader(pdf, { title: headerTitle, fecha: '', subtitulo: '' });

  // Margen superior para contenido (debajo del header) — margen extra para que no se traslape
  const contentTop = HEADER_HEIGHT + 30; // 66 + 30 = 96
  let cursorY = contentTop;

  // Agrupar documentos por sucursal
  const bySucursal = {};
  (docs || []).forEach((d) => {
    const sid = d?.sucursalId || '—';
    if (!bySucursal[sid]) bySucursal[sid] = [];
    bySucursal[sid].push(d);
  });

  // Helper: asegurar espacio antes de iniciar una sucursal
  const ensureSpace = (minSpace = 40) => {
    const h = pdf.internal.pageSize.getHeight();
    if (cursorY + minSpace > h - 60) {
      pdf.addPage();
      addHeader(pdf, { title: headerTitle, fecha: '', subtitulo: '' });
      cursorY = contentTop;
    }
  };

  // Subtítulo de sucursal
  const drawSucursalTitle = (name) => {
    ensureSpace(28);
    const w = pdf.internal.pageSize.getWidth();
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(33, 37, 41);
    pdf.setFontSize(13);
    pdf.text(`Sucursal: ${name}`, 40, cursorY);
    pdf.setDrawColor(230, 236, 240);
    pdf.line(40, cursorY + 6, w - 40, cursorY + 6);
    cursorY += 16;
  };

  // Recorrer sucursales (flujo continuo; autoTable controla saltos de página)
  Object.entries(bySucursal).forEach(([sucursalId, pagos], idx) => {
    const sucNom = sucursalesMap[sucursalId] || sucursalId || '—';
    if (idx > 0) cursorY += 8;
    drawSucursalTitle(sucNom);

    // Aplanar items de TODOS los docs de esa sucursal (Descripción, Cantidad, No. de ref.)
    const bodyRows = [];
    let totalUtilizadoSuc = 0;
    let cajaChicaTotal = 0;
    let sobranteTotal = 0;

    pagos.forEach((p) => {
      const items = Array.isArray(p.items) ? p.items : [];
      items.forEach((it) => {
        bodyRows.push([
          (it.descripcion || '—').toString(),
          toMoney(n(it.monto)),
          (it.ref || '—').toString(), // No. de ref.
        ]);
      });

      // Totales de la sucursal
      const usado = n(p.totalUtilizado ?? items.reduce((a, b) => a + n(b.monto), 0));
      totalUtilizadoSuc += usado;
      cajaChicaTotal += n(p.cajaChicaUsada);
      sobranteTotal += n(p.sobranteParaManana);
    });

    // Tabla principal por sucursal (sin Categoría; "No. de ref.")
    autoTable(pdf, {
      startY: cursorY,
      head: [['Descripción', 'Cantidad', 'No. de ref.']],
      body: bodyRows.length ? bodyRows : [['—', toMoney(0), '—']],
      styles: { fontSize: 9, cellPadding: 4, lineWidth: 0.2, lineColor: [230, 236, 240] },
      headStyles: { fillColor: [25, 118, 210], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 320 },                 // Descripción
        1: { halign: 'right', cellWidth: 110 },// Cantidad
        2: { cellWidth: 120 },                 // No. de ref.
      },
      theme: 'grid',
      margin: { top: contentTop, left: 40, right: 40 },
      didDrawPage: () => {
        // Header en cada página, con margen top para evitar traslape
        addHeader(pdf, { title: headerTitle, fecha: '', subtitulo: '' });
      },
    });

    cursorY = pdf.lastAutoTable?.finalY ? pdf.lastAutoTable.finalY + 8 : cursorY + 8;

    // Subtabla de totales por sucursal
    autoTable(pdf, {
      startY: cursorY,
      head: [['Resumen de la sucursal', 'Monto']],
      body: [
        ['Total utilizado', toMoney(totalUtilizadoSuc)],
        ['Caja chica usada', toMoney(cajaChicaTotal)],
        ['Sobrante para mañana', toMoney(sobranteTotal)],
      ],
      styles: { fontSize: 9, cellPadding: 4, lineWidth: 0.2, lineColor: [230, 236, 240] },
      headStyles: { fillColor: [236, 239, 241], textColor: [33, 37, 41] },
      columnStyles: {
        0: { cellWidth: 300 },
        1: { halign: 'right', cellWidth: 160 },
      },
      theme: 'grid',
      margin: { top: contentTop, left: 40, right: 40 },
      didDrawPage: () => {
        addHeader(pdf, { title: headerTitle, fecha: '', subtitulo: '' });
      },
    });

    cursorY = pdf.lastAutoTable?.finalY ? pdf.lastAutoTable.finalY + 14 : cursorY + 14;
  });

  addFooterPageNumbers(pdf);
  pdf.save(`${sanitize(nombre)}.pdf`);
}

/**
 * PDF de DEPÓSITOS para UNA fila de pagos (solo "Descripción" y "Cantidad").
 * - Encabezado estilo cuadre
 * - Tabla simple 2 columnas + total
 */
export function exportDepositosPdf(row, sucursalNombre = '—', nombreCustom) {
  const pdf = createDoc();

  const fecha = row?.fecha || '';
  addHeader(pdf, {
    title: `Depósitos`,
    fecha: '',
    subtitulo: `Sucursal: ${sucursalNombre}`,
  });

  const items = Array.isArray(row?.items) ? row.items : [];
  const bodyRows = items.map((it) => [
    (it.descripcion || '—').toString(),
    toMoney(n(it.monto)),
  ]);
  const total = items.reduce((s, it) => s + n(it.monto), 0);

  autoTable(pdf, {
    startY: HEADER_HEIGHT + 24, // margen bajo el título
    head: [['Descripción', 'Cantidad']],
    body: bodyRows.length ? bodyRows : [['—', toMoney(0)]],
    styles: { fontSize: 10, cellPadding: 5, lineWidth: 0.2, lineColor: [230, 236, 240] },
    headStyles: { fillColor: [21, 101, 192], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 360 },
      1: { halign: 'right', cellWidth: 180 },
    },
    theme: 'grid',
    margin: { top: HEADER_HEIGHT + 24, left: 40, right: 40 },
    foot: [['TOTAL', toMoney(total)]],
    footStyles: { fillColor: [236, 239, 241], textColor: [33, 37, 41], halign: 'right' },
    didDrawPage: () => {
      addHeader(pdf, { title: 'Depósitos', fecha: '', subtitulo: `Sucursal: ${sucursalNombre}` });
    },
  });

  addFooterPageNumbers(pdf);

  const fileName = nombreCustom || `Depositos_${sucursalNombre}_${fecha}`;
  pdf.save(`${sanitize(fileName)}.pdf`);
}
