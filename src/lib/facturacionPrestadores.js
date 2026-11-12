import { supabase } from './supabase.js';

export const FECHA_INICIO_FACTURACION_PRESTADORES = '2026-11-01';
export const ACUERDO_FACTURA_RECIBIDA = 'FACTURA_RECIBIDA';
export const ACUERDO_FACTURAR_MANUAL = 'FACTURAR_MANUAL';
export const PERIODO_INICIO_FACTURACION_AUXILIARES = { mes: 10, anio: 2026 }; // Oct 2026 cerrada -> se factura en Nov 2026

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

export function esPrestadorExcluidoFacturacion(nombre) {
  const n = String(nombre || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    (n.includes('VIVIANA') && n.includes('JIMENEZ')) ||
    (n.includes('VALERIA') && n.includes('MEDINA'))
  );
}

export function esPacienteExcluidoFacturacion(texto) {
  const n = String(texto || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return n.includes('QUEVEDO') && n.includes('GUADALUPE');
}

export function esAuxiliarIncluidoFacturacion(aux) {
  if (!aux) return false;
  const n = String(aux.nombre || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const tipo = String(aux.tipo_liq || '').toUpperCase().trim();

  if (n.includes('LUCIA') && n.includes('SORANE')) {
    return n.includes('HORA') || tipo === 'HORA';
  }
  if (n.includes('OLIVERA') && n.includes('MARINA')) {
    return true;
  }
  if (n.includes('MASCARE') && n.includes('HUGO')) {
    return true;
  }
  return false;
}

export function esPeriodoAuxiliarFacturable(periodo) {
  const str = String(periodo || '').trim();
  const match = str.match(/^(\d{1,2})\/(\d{4})$/);
  if (!match) return false;
  const mes = parseInt(match[1], 10);
  const anio = parseInt(match[2], 10);
  if (isNaN(mes) || isNaN(anio)) return false;
  return (
    anio > PERIODO_INICIO_FACTURACION_AUXILIARES.anio ||
    (anio === PERIODO_INICIO_FACTURACION_AUXILIARES.anio && mes >= PERIODO_INICIO_FACTURACION_AUXILIARES.mes)
  );
}

export function formatearConceptoLiquidacionAuxiliar(periodo) {
  const str = String(periodo || '').trim();
  const match = str.match(/^(\d{1,2})\/(\d{4})$/);
  if (!match) return `Liquidación Cerrada Auxiliar (${str})`;
  let mes = parseInt(match[1], 10);
  let anio = parseInt(match[2], 10);
  let mesSig = mes + 1;
  let anioSig = anio;
  if (mesSig > 12) {
    mesSig = 1;
    anioSig += 1;
  }
  const mm = String(mes).padStart(2, '0');
  const mmSig = String(mesSig).padStart(2, '0');
  return `Liquidación Cerrada ${mm}/${anio} (a facturar en ${mmSig}/${anioSig})`;
}

export async function fetchIdsPacientesExcluidosFacturacion() {
  try {
    const { data, error } = await supabase
      .from('pacientes_motor')
      .select('id_paciente, nombre_apellido')
      .ilike('nombre_apellido', '%QUEVEDO%');
    if (error) throw error;
    const ids = new Set();
    (data || []).forEach(p => {
      if (esPacienteExcluidoFacturacion(p.nombre_apellido)) {
        ids.add(String(p.id_paciente));
      }
    });
    return ids;
  } catch (err) {
    console.warn('No se pudieron consultar pacientes excluidos de facturación:', err);
    return new Set();
  }
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

export function construirMapaFacturarManual(rows = []) {
  const mapa = {};
  (rows || []).forEach(r => {
    if (r?.acuerdo !== ACUERDO_FACTURAR_MANUAL) return;
    const targetId = String(r.concepto || '').replace(/^FACTURAR_MANUAL#/, '').trim();
    if (!targetId) return;
    mapa[targetId] = {
      id_mov_override: r.id_mov,
      monto: Math.round(parsearDecimalSeguro(r.saldo) * 100) / 100
    };
  });
  return mapa;
}

/**
 * Calcula el importe que debe facturar el prestador por un movimiento individual.
 * Solo aplica desde FECHA_INICIO_FACTURACION_PRESTADORES ('2026-11-01') y excluye a prestadores/pacientes exceptuados
 * (Viviana Jiménez, Dra. Valeria Medina y paciente Quevedo Guadalupe).
 * Si existe una carga manual vinculante en manualFacturarMap para mov.id_mov, utiliza ese importe.
 */
export function calcularMontoFacturarMovimiento(
  mov,
  pagosMap,
  nombrePrestador,
  pacientesExcluidosIds = null,
  manualFacturarMap = null
) {
  if (!mov || esPrestadorExcluidoFacturacion(nombrePrestador)) return 0;
  if (mov.acuerdo === ACUERDO_FACTURA_RECIBIDA || mov.acuerdo === ACUERDO_FACTURAR_MANUAL) return 0;
  const fecha = String(mov.fecha || '').slice(0, 10);
  if (!fecha || fecha < FECHA_INICIO_FACTURACION_PRESTADORES) return 0;

  if (manualFacturarMap && mov.id_mov !== undefined && mov.id_mov !== null) {
    const manualEntry = manualFacturarMap[String(mov.id_mov)];
    if (manualEntry !== undefined) {
      return Math.max(0, Math.round(parsearDecimalSeguro(manualEntry.monto) * 100) / 100);
    }
  }

  if (esPacienteExcluidoFacturacion(mov.concepto)) return 0;
  if (
    pacientesExcluidosIds &&
    mov.id_paciente !== null &&
    mov.id_paciente !== undefined &&
    pacientesExcluidosIds.has(String(mov.id_paciente))
  ) {
    return 0;
  }
  const haber = parsearDecimalSeguro(mov.haber);
  if (haber <= 0 || !mov.id_pago) return 0;

  const pago = pagosMap[String(mov.id_pago)];
  const ratio = calcularRatioFacturablePago(pago);
  if (ratio <= 0) return 0;

  return Math.round(haber * ratio * 100) / 100;
}
