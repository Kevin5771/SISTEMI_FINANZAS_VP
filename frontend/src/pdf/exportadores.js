import jsPDF from 'jspdf';
import { renderCuadreSection, addFooterPageNumbers } from './cuadrePdf';

export const exportSingleCuadrePdf = (c, sucursalNombre, formatDate) => {
  const pdf = new jsPDF({ orientation:'portrait', unit:'pt', format:'a4' });
  renderCuadreSection(pdf, c, sucursalNombre, formatDate);
  addFooterPageNumbers(pdf);
  pdf.save(`Venta_${c.fecha}.pdf`);
};

export const exportGroupedPdf = (docs, sucursalesMap, nombreArchivo, formatDate) => {
  const pdf = new jsPDF({ orientation:'portrait', unit:'pt', format:'a4' });
  docs.forEach((c, idx) => {
    if (idx > 0) pdf.addPage();
    renderCuadreSection(pdf, c, sucursalesMap[c.sucursalId] || '—', formatDate);
  });
  addFooterPageNumbers(pdf);
  pdf.save(`${nombreArchivo}.pdf`);
};
