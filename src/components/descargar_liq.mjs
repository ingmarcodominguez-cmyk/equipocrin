import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = 'https://gqhfrzvtccxrixdtazzs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_F_o1x9xNt9XaEQxFjvmYrA_ctISFrta'; // Poné acá tu anon key real

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const parsearDecimal = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/\$/g, '').trim();
  if (str.includes(',')) {
    const limpio = str.replace(/\./g, '').replace(',', '.');
    const num = Number(limpio);
    return isNaN(num) ? 0 : num;
  }
  const num = Number(str);
  return isNaN(num) ? 0 : num;
};

async function descargarHistoricoCompleto(nombreBuscado) {
  try {
    console.log(`Buscando al profesional: ${nombreBuscado}...`);

    const { data: prestadores, error: errP } = await supabase
      .from('prestadores_motor')
      .select('*')
      .ilike('nombre_prestador', `%${nombreBuscado}%`);

    if (errP) throw errP;
    if (!prestadores || prestadores.length === 0) {
      console.log(`❌ No se encontró ningún prestador con el nombre: "${nombreBuscado}"`);
      return;
    }

    const prestador = prestadores[0];
    console.log(`✅ Encontrado: ${prestador.nombre_prestador} (ID: ${prestador.id_prestador})`);

    // Traemos TODOS los movimientos sin filtrar por saldo cero
    const { data: movimientos, error: errM } = await supabase
      .from('movprestadores_motor')
      .select('*')
      .eq('id_prestador', prestador.id_prestador)
      .order('fecha', { ascending: true });

    if (errM) throw errM;
    if (!movimientos || movimientos.length === 0) {
      console.log(`⚠️ El prestador no tiene movimientos registrados.`);
      return;
    }

    let running = 0;
    const conSaldo = movimientos.map(m => {
      const debe = parsearDecimal(m.debe);
      const haber = parsearDecimal(m.haber);
      running += (haber - debe);
      return { ...m, debeNum: debe, haberNum: haber, saldoCalculado: running };
    });

    const BOM = "\uFEFF";
    let csv = "sep=;\n";
    csv += `Historial Completo - Profesional: ${prestador.nombre_prestador}\n\n`;
    csv += "Fecha;Concepto;Acuerdo;Debe ($);Haber ($);Saldo ($)\r\n";

    conSaldo.forEach(m => {
      const fecha = m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/D';
      const concepto = (m.concepto || '').replace(/;/g, ',');
      const acuerdo = (m.acuerdo || '-').replace(/;/g, ',');
      const debeStr = m.debeNum > 0 ? m.debeNum.toFixed(2).replace('.', ',') : '';
      const haberStr = m.haberNum > 0 ? m.haberNum.toFixed(2).replace('.', ',') : '';
      const saldoStr = m.saldoCalculado.toFixed(2).replace('.', ',');
      
      csv += `${fecha};${concepto};${acuerdo};${debeStr};${haberStr};${saldoStr}\r\n`;
    });

    const nombreArchivo = `Historico_Completo_${prestador.nombre_prestador.replace(/\s+/g, '_')}.csv`;
    fs.writeFileSync(nombreArchivo, BOM + csv, 'utf8');
    console.log(`🎉 ¡Archivo histórico generado con éxito! Guardado como: ${nombreArchivo}\n`);

  } catch (error) {
    console.error("Error al generar el reporte:", error.message);
  }
}

// Reemplazá "Nombre Apellido" por el nombre real del prestador
await descargarHistoricoCompleto("JIMENEZ ANA");