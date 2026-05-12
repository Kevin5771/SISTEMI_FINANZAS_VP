// src/utils/cuadrePDF.js
import autoTable from 'jspdf-autotable';
import { n, toMoney } from '../utils/numbers';

/* ===== Helpers de efectivo ===== */
const subtotalCaja = (a = {}) =>
  n(a.q200) * 200 +
  n(a.q100) * 100 +
  n(a.q50) * 50 +
  n(a.q20) * 20 +
  n(a.q10) * 10 +
  n(a.q5) * 5 +
  n(a.q1) * 1;

/* ===== Métricas con EFECTIVO NETO (subtotal - apertura) ===== */
export const calcCuadreMetrics = (c) => {
  const arqueo = c.arqueo || [{}, {}, {}];
  const cierre = c.cierre || [{}, {}, {}];

  const totalArqueoEfectivo = arqueo.reduce((s, x) => {
    const apertura = Number.isFinite(+x.apertura) ? +x.apertura : 0;
    return s + (subtotalCaja(x) - apertura);
  }, 0);
  const arqueoTar = arqueo.reduce((s, x) => s + n(x.tarjeta), 0);
  const arqueoMot = arqueo.reduce((s, x) => s + n(x.motorista), 0);

  const cierreEf  = cierre.reduce((s, x) => s + n(x.efectivo), 0);
  const cierreTar = cierre.reduce((s, x) => s + n(x.tarjeta), 0);
  const cierreMot = cierre.reduce((s, x) => s + n(x.motorista), 0);

  const gastos = (c.gastos || []).reduce((s, g) => s + n(g.cantidad), 0);

  const cajaChicaUsada = n(c.cajaChicaUsada);
  const faltantePagado = n(c.faltantePagado);

  const ex = c.extras || {};
  const pedidosYaMonto = n(
    ex.pedidosYaMonto ?? ex.pedidosYaCantidad ?? c.pedidosYaMonto ?? c.pedidosYaCantidad ?? 0
  );
  const amexTotal = n(
    (ex.americanExpress && ex.americanExpress.total) ??
    c.americanExpressTotal ??
    0
  );

  // === DIFERENCIA REAL (efectivo + tarjeta), alineado con el hook useRegistrarCierreTotals ===
  const diffReal = (totalArqueoEfectivo + arqueoTar) - (cierreEf + cierreTar);
  // Mantén el nombre original para no romper llamadas existentes:
  const diffEf = diffReal;

  const totalDepositar = totalArqueoEfectivo - gastos + cajaChicaUsada + faltantePagado;

  return {
    totalArqueoEfectivo, arqueoTar, arqueoMot,
    cierreEf, cierreTar, cierreMot,
    gastos, cajaChicaUsada, faltantePagado,
    pedidosYaMonto, amexTotal,
    diffEf,          // ahora = diferencia REAL (efectivo + tarjeta)
    diffReal,        // disponible si quieres usarlo explícito
    totalDepositar,
  };
};

/* ===== Encabezado y footer ===== */
export const addHeader = (pdf, { title, fecha, sucursal, formatDate }) => {
  const w = pdf.internal.pageSize.getWidth();
  pdf.setFillColor(245, 248, 252);
  pdf.rect(0, 0, w, 66, 'F');

  const sucNom = (sucursal || '—').toString();
  const computedTitle = title ?? `Cuadre - ${sucNom}`;
  const fechaLabel = typeof formatDate === 'function' ? formatDate(fecha) : (fecha || '');

  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(33, 37, 41);
  pdf.setFontSize(18);
  pdf.text(computedTitle, 40, 32);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(90, 90, 90);
  if (fechaLabel) pdf.text(`Fecha: ${fechaLabel}`, 40, 50);
};

export const addFooterPageNumbers = (pdf) => {
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

export const getCuadreDownloadName = (fecha, formatDate) => {
  const fechaLabel = typeof formatDate === 'function' ? formatDate(fecha) : (fecha || '');
  const base = `Cuadre - ${fechaLabel}`.trim();
  return `${base}`.replace(/[^\w .-]/g, '_') + '.pdf';
};

/* ===== Render principal ===== */
export const renderCuadreSection = (pdf, c, sucursalNombre, formatDate, options = {}) => {
  const { showPedidosYa: optPY = false, showAmex: optAmex = false } = options;

  // Encabezado
  addHeader(pdf, {
    fecha: c.fecha,
    sucursal: sucursalNombre || '—',
    formatDate,
  });

  let y = 76; // debajo del encabezado
  const width = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const bottomMargin = 30;

  /* === Leyenda superior derecha === */
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(90, 90, 90);
  pdf.text('Montos en Quetzales (Q)', width - 40, 68, { align: 'right' });
  pdf.setTextColor(33, 37, 41);

  /* === Arqueo físico === */
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Arqueo físico', 40, y);
  y += 6;

  const arqueo = c.arqueo || [{}, {}, {}];

  const arqueoRows = [0, 1, 2].map((i) => {
    const a = arqueo[i] || {};
    const apertura = Number.isFinite(+a.apertura) ? +a.apertura : 0;

    const sub200 = n(a.q200) * 200;
    const sub100 = n(a.q100) * 100;
    const sub50  = n(a.q50)  * 50;
    const sub20  = n(a.q20)  * 20;
    const sub10  = n(a.q10)  * 10;
    const sub5   = n(a.q5)   * 5;
    const sub1   = n(a.q1)   * 1;

    const subtotal = sub200 + sub100 + sub50 + sub20 + sub10 + sub5 + sub1;
    const efectivoNeto = subtotal - apertura; // (menos apertura)

    const tarjeta   = n(a.tarjeta);
    const motorista = n(a.motorista);

    return [
      `Caja ${i + 1}`,
      toMoney(apertura),
      toMoney(sub200), toMoney(sub100), toMoney(sub50), toMoney(sub20), toMoney(sub10), toMoney(sub5), toMoney(sub1),
      toMoney(efectivoNeto),
      toMoney(tarjeta),
      toMoney(motorista),
    ];
  });

  // Totales Arqueo (solo al pie)
  const mArqEfTotal = arqueo.reduce((s, x) => {
    const apertura = Number.isFinite(+x.apertura) ? +x.apertura : 0;
    return s + (subtotalCaja(x) - apertura);
  }, 0);
  const mArqTar = arqueo.reduce((s, x) => s + n(x.tarjeta), 0);
  const mArqMot = arqueo.reduce((s, x) => s + n(x.motorista), 0);

  autoTable(pdf, {
    startY: y,
    head: [[
      'Cajas', 'Apertura', 'Q200', 'Q100', 'Q50', 'Q20', 'Q10', 'Q5', 'Q1', 'Efectivo\n(Menos apertura)', 'Tarjeta', 'Motorista'
    ]],
    body: arqueoRows,
    styles: { fontSize: 8, cellPadding: 2, lineWidth: 0.2, lineColor: [230, 236, 240] },
    headStyles: { fontSize: 8, fillColor: [13, 71, 161], textColor: 255 },
    columnStyles: {
      1:  { halign: 'right' },
      2:  { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
      5:  { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' },
      8:  { halign: 'right' }, 9: { halign: 'right' }, 10:{ halign: 'right' },
      11: { halign: 'right' },
    },
    theme: 'grid',
    foot: [[
      '', '', '', '', '', '', '', '',
      { content: 'Totales', styles: { halign: 'right' } },
      { content: toMoney(mArqEfTotal), styles: { halign: 'right' } },
      { content: toMoney(mArqTar),     styles: { halign: 'right' } },
      { content: toMoney(mArqMot),     styles: { halign: 'right' } },
    ]],
    footStyles: { fontSize: 8, fillColor: [236, 239, 241], textColor: [33, 37, 41], halign: 'right' },
  });

  y = pdf.lastAutoTable.finalY + 10;

  /* === Cierre de sistema === */
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Cierre de sistema', 40, y);
  y += 6;

  const cierre = c.cierre || [{}, {}, {}];
  const cierreRows = [0, 1, 2].map((i) => {
    const cc = cierre[i] || {};
    const ef  = n(cc.efectivo);
    const tar = n(cc.tarjeta);
    const mot = n(cc.motorista);
    const tot = ef + tar;
    return [
      `Caja ${i + 1}`,
      toMoney(ef),
      toMoney(tar),
      toMoney(mot),
      toMoney(tot),
    ];
  });

  const mCieEf  = cierre.reduce((s, x) => s + n(x.efectivo), 0);
  const mCieTar = cierre.reduce((s, x) => s + n(x.tarjeta), 0);
  const mCieMot = cierre.reduce((s, x) => s + n(x.motorista), 0);
  const mCieTot = mCieEf + mCieTar;

  autoTable(pdf, {
    startY: y,
    head: [['Cajas', 'Efectivo', 'Tarjeta', 'Motorista', 'Total'] ],
    body: cierreRows,
    styles: { fontSize: 9, cellPadding: 3, lineWidth: 0.2, lineColor: [230, 236, 240] },
    headStyles: { fillColor: [25, 118, 210], textColor: 255 },
    columnStyles: {
      1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' },
    },
    theme: 'grid',
    foot: [[
      { content: 'Totales', styles: { halign: 'right' } },
      { content: toMoney(mCieEf),  styles: { halign: 'right' } },
      { content: toMoney(mCieTar), styles: { halign: 'right' } },
      { content: toMoney(mCieMot), styles: { halign: 'right' } },
      { content: toMoney(mCieTot), styles: { halign: 'right' } },
    ]],
    footStyles: { fillColor: [236, 239, 241], textColor: [33, 37, 41], halign: 'right' },
  });

  y = pdf.lastAutoTable.finalY + 10;

  /* === Gastos (solo Descripción y Cantidad) === */
  const gastos = Array.isArray(c.gastos) ? c.gastos : [];
  const gastosRows = gastos.map((g) => [
    (g.descripcion || '').toString(),
    toMoney(n(g.cantidad)),
  ]);

  const totalGastos = gastos.reduce((s, g) => s + n(g.cantidad), 0);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('Gastos', 40, y);
  y += 6;

  autoTable(pdf, {
    startY: y,
    head: [['Descripción', 'Cantidad']],
    body: gastosRows.length ? gastosRows : [['—', toMoney(0)]],
    styles: { fontSize: 9, cellPadding: 3, lineWidth: 0.2, lineColor: [230, 236, 240] },
    headStyles: { fillColor: [21, 101, 192], textColor: 255 },
    columnStyles: { 1: { halign: 'right' } },
    theme: 'grid',
    foot: [[
      { content: 'Total', styles: { halign: 'right' } },
      { content: toMoney(totalGastos), styles: { halign: 'right' } }
    ]],
    footStyles: { fillColor: [236, 239, 241], textColor: [33, 37, 41] },
  });

  y = pdf.lastAutoTable.finalY + 12;

  /* === Resumen (igual que antes, pero m.diffEf ya es REAL) === */
  {
    const m = calcCuadreMetrics(c);

    const boxTop = y;
    const leftColX = 52;
    const rightColX = width / 2 + 10;
    const GAP = 16;

    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(33, 37, 41);
    pdf.text('Resumen', leftColX, boxTop + 18);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    const drawLine = (x, yLine, label, value) => {
      pdf.setTextColor(90, 90, 90);
      pdf.text(label, x, yLine);
      pdf.setTextColor(33, 37, 41);
      pdf.text(value, x + 140, yLine);
    };

    let leftY = boxTop + 36;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Ventas Total Sistema', leftColX, leftY);
    pdf.setFont('helvetica', 'normal');
    leftY += GAP;
    drawLine(leftColX, leftY, 'Efectivo',   toMoney(m.cierreEf));  leftY += GAP;
    drawLine(leftColX, leftY, 'Tarjeta',    toMoney(m.cierreTar)); leftY += GAP;
    drawLine(leftColX, leftY, 'A domicilio',toMoney(m.cierreMot)); leftY += GAP;
    const totalSistema = m.cierreEf + m.cierreTar;
    drawLine(leftColX, leftY, 'Total Sistema', toMoney(totalSistema));

    let rightY = boxTop + 36;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Control Administración', rightColX, rightY);
    pdf.setFont('helvetica', 'normal');
    rightY += GAP;

    drawLine(rightColX, rightY, 'Efectivo',            toMoney(m.totalArqueoEfectivo)); rightY += GAP;
    drawLine(rightColX, rightY, 'A domicilio',         toMoney(m.arqueoMot));           rightY += GAP;
    drawLine(rightColX, rightY, 'Gastos',              toMoney(m.gastos));              rightY += GAP;

    const showPY = Boolean(optPY || m.pedidosYaMonto > 0);
    const showAX = Boolean(optAmex || m.amexTotal > 0);

    if (showPY) { drawLine(rightColX, rightY, 'Total Pedidos Ya', toMoney(m.pedidosYaMonto)); rightY += GAP; }
    if (showAX) { drawLine(rightColX, rightY, 'Total American Express', toMoney(m.amexTotal)); rightY += GAP; }

    drawLine(rightColX, rightY, 'Caja chica (usada)',  toMoney(m.cajaChicaUsada)); rightY += GAP;

    const diffLabel = m.diffEf >= 0 ? 'Sobrante' : 'Faltante';
    drawLine(rightColX, rightY, diffLabel, toMoney(Math.abs(m.diffEf))); rightY += GAP;

    if (m.faltantePagado > 0) {
      drawLine(rightColX, rightY, 'Faltante pagado', toMoney(m.faltantePagado)); rightY += GAP;
    }

    const contentBottom = Math.max(leftY, rightY);
    const totalDepY = contentBottom + 20;
    const depColor = m.totalDepositar < 0 ? [183, 28, 28] : [27, 94, 32];
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(...depColor);
    const centerX = width / 2;
    pdf.text(`Total a depositar: ${toMoney(m.totalDepositar)}`, centerX, totalDepY, { align: 'center' });
    pdf.setTextColor(33, 37, 41);

    const boxHeight = (totalDepY - boxTop) + 14;
    pdf.setDrawColor(230, 236, 240);
    pdf.roundedRect(40, boxTop, width - 80, boxHeight, 4, 4);

    y = boxTop + boxHeight + 12;
  }

  // Comentario (nueva página si hace falta)
  if (y > pageHeight - bottomMargin) {
    pdf.addPage();
    y = 40;
  }

  const comentarioPlano = (c.comentario || '').toString().trim();
  if (comentarioPlano) {
    autoTable(pdf, {
      startY: y,
      head: [['Comentario']],
      body: [[comentarioPlano]],
      styles: { fontSize: 10, cellPadding: 6, lineWidth: 0.2, lineColor: [230, 236, 240] },
      headStyles: { fillColor: [69, 90, 100], textColor: 255 },
      theme: 'grid',
    });
  }
};
