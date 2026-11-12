import { supabase } from './supabase.js';

export const FECHA_INICIO_FACTURACION_PRESTADORES = '2026-11-01';
export const ACUERDO_FACTURA_RECIBIDA = 'FACTURA_RECIBIDA';

export function parsearDecimalSeguro(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  const str = String(val).replace(/\$/g, '').trim();
  if (str.includes(',')) {
    const limpio = str.replace(/\./g, '').replace(',', '.');
    const num = Number(limpio);
    return isNaN(num) ? 0 : num;
  }
  if (str.includes('.')) {
    const partes = str.split('.');
    if (partes.length > 2) {
      const num = Number(str.replace(/\./g, ''));
      return isNaN(num) ? 0 : num;
    }
    if (partes[1]?.length === 3) {
      const num = Number(str.replace(/\./g, ''));
      return isNaN(num) ? 0 : num;
    }
    const num = Number(str);
    return isNaN(num) ? 0 : num;
  }
  const num = Number(str);
  return isNaN(num) ? 0 : num;
}

export function esVivianaJimenezNombre(nombre) {
  const n = String(nombre || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return n.includes('VIVIANA') && n.includes('JIMENEZ');
}

/**
 * Calcula la proporción [0..1] de un registro de pagos_motor que corresponde
 * a medios bancarizados / electrónicos (Transferencia, Depósito, QR Mercado Pago),
 * excluyendo el Efectivo.
 */
export function calcularRatioFacturablePago(pago) {
  if (!pago) return 0;
  const fp = String(pago.forma_pago || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  if (fp === 'COMBINADO' || fp.includes('COMBINAD')) {
    const obs = String(pago.observacion || '');
    const mEf = obs.match(/Ef:\s*\$?([\d.,-]+)/i);
    const mMp = obs.match(/MP:\s*\$?([\d.,-]+)/i);
    const mTr = obs.match(/Transf:\s*\$?([\d.,-]+)/i);

    const valEf = mEf ? parsearDecimalSeguro(mEf[1]) : 0;
    const valMp = mMp ? parsearDecimalSeguro(mMp[1]) : 0;
    const valTr = mTr ? parsearDecimalSeguro(mTr[1]) : 0;
    const sumaPartes = valEf + valMp + valTr;
    const totalPago = sumaPartes > 0 ? sumaPartes : parsearDecimalSeguro(pago.importe);
    const noEfectivo = valMp + valTr;

    if (totalPago <= 0) return 0;
    return Math.min(1, Math.max(0, noEfectivo / totalPago));
  }

  if (fp.includes('EFECTIVO')) return 0;

  if (
    fp.includes('TRANSFERENCIA') ||
    fp.includes('DEPOSITO') ||
    fp.includes('QR') ||
    fp.includes('MERCADO PAGO') ||
    fp.includes('BILLETERA')
  ) {
    return 1;
  }

  return 0;
}

/**
 * Trae desde pagos_motor el mapa { [id_pago]: pagoRow } para una lista de id_pago.
 */
export async function fetchMapaPagosPorIds(idPagos = []) {
  const unicos = Array.from(
    new Set(
      (idPagos || [])
        .filter(id => id !== null && id !== undefined && id !== '')
        .map(id => Number(id))
        .filter(id => !isNaN(id) && id > 0)
    )
  );

  const mapa = {};
  if (unicos.length === 0) return mapa;

  for (let i = 0; i < unicos.length; i += 200) {
    const lote = unicos.slice(i, i + 200);
    const { data, error } = await supabase
      .from('pagos_motor')
      .select('id_pago, forma_pago, importe, observacion, estado, fecha_pago')
      .in('id_pago', lote);

    if (error) throw error;
    (data || []).forEach(p => {
      if ((p.estado || '').toUpperCase() !== 'ANULADO') {
        mapa[String(p.id_pago)] = p;
      }
    });
  }

  return mapa;
}

/**
 * Calcula el importe que debe facturar el prestador por un movimiento individual.
 * Solo aplica desde FECHA_INICIO_FACTURACION_PRESTADORES ('2026-11-01') y excluye a Viviana Jiménez.
 */
export function calcularMontoFacturarMovimiento(mov, pagosMap, nombrePrestador) {
  if (!mov || esVivianaJimenezNombre(nombrePrestador)) return 0;
  if (mov.acuerdo === ACUERDO_FACTURA_RECIBIDA) return 0;
  const fecha = String(mov.fecha || '').slice(0, 10);
  if (!fecha || fecha < FECHA_INICIO_FACTURACION_PRESTADORES) return 0;
  const haber = parsearDecimalSeguro(mov.haber);
  if (haber <= 0 || !mov.id_pago) return 0;

  const pago = pagosMap[String(mov.id_pago)];
  const ratio = calcularRatioFacturablePago(pago);
  if (ratio <= 0) return 0;

  return Math.round(haber * ratio * 100) / 100;
}
