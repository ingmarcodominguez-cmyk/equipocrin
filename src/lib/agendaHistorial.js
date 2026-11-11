import { supabase } from './supabase.js';

const MESES_ES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
];

const MESES_MAP = {
  ENERO: '01', FEBRERO: '02', MARZO: '03', ABRIL: '04',
  MAYO: '05', JUNIO: '06', JULIO: '07', AGOSTO: '08',
  SEPTIEMBRE: '09', SETIEMBRE: '09', OCTUBRE: '10',
  NOVIEMBRE: '11', DICIEMBRE: '12'
};

export const PREFIJO_HIST_MES = 'HIST_MES|';
export const PREFIJO_HIST_CAMBIO = 'HIST_CAMBIO|';
export const PREFIJO_VIGENCIA = 'VIGENCIA|';

/**
 * Devuelve fecha local en formato YYYY-MM-DD y período YYYY-MM.
 */
export function obtenerFechaHoyISO() {
  const sim = typeof localStorage !== 'undefined' ? localStorage.getItem('crin_fecha_trabajo_simulada') : null;
  const d = sim ? new Date(sim + 'T12:00:00') : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function obtenerPeriodoActual() {
  return obtenerFechaHoyISO().slice(0, 7);
}

export function obtenerUltimoDiaMesISO(periodoYYYYMM) {
  if (!periodoYYYYMM || !/^\d{4}-\d{2}$/.test(periodoYYYYMM)) return `${obtenerPeriodoActual()}-28`;
  const [anio, mes] = periodoYYYYMM.split('-').map(Number);
  const ultimoDia = new Date(anio, mes, 0).getDate();
  return `${periodoYYYYMM}-${String(ultimoDia).padStart(2, '0')}`;
}

export function restarUnDiaISO(fechaYYYYMMDD) {
  if (!fechaYYYYMMDD || !/^\d{4}-\d{2}-\d{2}$/.test(fechaYYYYMMDD)) return obtenerFechaHoyISO();
  const d = new Date(`${fechaYYYYMMDD}T12:00:00`);
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function calcularHastaAnterior(fechaNuevaVigencia, fechaDesdeOriginal) {
  const base = fechaNuevaVigencia && /^\d{4}-\d{2}-\d{2}$/.test(fechaNuevaVigencia)
    ? fechaNuevaVigencia
    : obtenerFechaHoyISO();
  const diaAnterior = restarUnDiaISO(base);
  if (fechaDesdeOriginal && /^\d{4}-\d{2}-\d{2}$/.test(fechaDesdeOriginal) && diaAnterior < fechaDesdeOriginal) {
    return fechaDesdeOriginal;
  }
  return diaAnterior;
}

export function formatearPeriodoNombre(periodoYYYYMM) {
  if (!periodoYYYYMM || !/^\d{4}-\d{2}$/.test(periodoYYYYMM)) return periodoYYYYMM || 'S/D';
  const [anio, mes] = periodoYYYYMM.split('-');
  const mesIdx = parseInt(mes, 10) - 1;
  const nombre = MESES_ES[mesIdx] || mes;
  return `${nombre.charAt(0) + nombre.slice(1).toLowerCase()} ${anio}`;
}

/**
 * Parsea metadatos almacenados en `observaciones` de sesiones_fijas.
 */
export function parsearMetadataSesion(s) {
  const obs = s?.observaciones || '';
  if (obs.startsWith(PREFIJO_HIST_MES)) {
    try {
      return { categoria: 'HIST_MES', ...JSON.parse(obs.slice(PREFIJO_HIST_MES.length)) };
    } catch {
      return { categoria: 'HIST_MES' };
    }
  }
  if (obs.startsWith(PREFIJO_HIST_CAMBIO)) {
    try {
      return { categoria: 'HIST_CAMBIO', ...JSON.parse(obs.slice(PREFIJO_HIST_CAMBIO.length)) };
    } catch {
      return { categoria: 'HIST_CAMBIO' };
    }
  }
  if (obs.startsWith(PREFIJO_VIGENCIA)) {
    try {
      return { categoria: 'VIGENCIA', ...JSON.parse(obs.slice(PREFIJO_VIGENCIA.length)) };
    } catch {
      return { categoria: 'VIGENCIA' };
    }
  }
  return {
    categoria: 'NORMAL',
    desde: s?.created_at ? String(s.created_at).slice(0, 10) : '2026-01-01',
    notaLibre: obs
  };
}

export function construirObservacionVigencia(desdeYYYYMMDD, notaLibre = '') {
  return `${PREFIJO_VIGENCIA}${JSON.stringify({ desde: desdeYYYYMMDD, notaLibre: notaLibre || undefined })}`;
}

export function construirObservacionHistCambio({ desde, hasta, accion, nota }) {
  return `${PREFIJO_HIST_CAMBIO}${JSON.stringify({
    tipo: 'CAMBIO_AGENDA',
    desde: desde || hasta,
    hasta,
    periodo_desde: (desde || hasta).slice(0, 7),
    periodo_hasta: hasta.slice(0, 7),
    accion,
    nota: nota || undefined
  })}`;
}

export function construirObservacionHistMes(periodoYYYYMM, fechaConsolidacion) {
  return `${PREFIJO_HIST_MES}${JSON.stringify({
    tipo: 'CONSOLIDADO_MES',
    periodo: periodoYYYYMM,
    fecha_consolidacion: fechaConsolidacion
  })}`;
}

/**
 * Trae todas las filas de sesiones_fijas paginando de a 1000 para evitar truncamiento de Supabase.
 */
export async function fetchTodasSesionesFijas(filtrosFn = null) {
  const todas = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    let query = supabase
      .from('sesiones_fijas')
      .select('*')
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);

    if (filtrosFn) {
      query = filtrosFn(query);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) break;

    todas.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return todas;
}

/**
 * Archiva una sesión antes de editarla, suspenderla o eliminarla, guardando su vigencia [desde..hasta].
 */
export async function archivarCambioSesion(sesionOriginal, accion, nota = '', fechaHastaCustom = null) {
  if (!sesionOriginal) return null;
  const hoy = obtenerFechaHoyISO();
  const meta = parsearMetadataSesion(sesionOriginal);
  const desde = meta.desde || (sesionOriginal.created_at ? String(sesionOriginal.created_at).slice(0, 10) : hoy);
  const hastaFinal = fechaHastaCustom && /^\d{4}-\d{2}-\d{2}$/.test(fechaHastaCustom)
    ? (hastaClamp(fechaHastaCustom, desde))
    : hoy;

  const registroHistorico = {
    paciente_id: sesionOriginal.paciente_id,
    paciente_nombre: sesionOriginal.paciente_nombre,
    profesional_id: sesionOriginal.profesional_id,
    dia_semana: sesionOriginal.dia_semana,
    hora: sesionOriginal.hora,
    tipo_prestacion: sesionOriginal.tipo_prestacion || null,
    estado: 'HISTORICO',
    asistencia: 'Histórico',
    observaciones: construirObservacionHistCambio({
      desde,
      hasta: hastaFinal,
      accion,
      nota
    })
  };

  const { data, error } = await supabase
    .from('sesiones_fijas')
    .insert([registroHistorico])
    .select();

  if (error) throw error;
  return data?.[0] || null;
}

function hastaClamp(hasta, desde) {
  if (desde && hasta < desde) return desde;
  return hasta;
}

/**
 * Si un mes ya estaba consolidado y se carga/edita un cambio con vigencia exacta al día 01 de ese mes,
 * actualiza únicamente el snapshot de ese paciente en ese período para mantener coherencia.
 */
export async function sincronizarSnapshotMesPaciente(uuidPaciente, periodoYYYYMM) {
  if (!uuidPaciente || !periodoYYYYMM || !/^\d{4}-\d{2}$/.test(periodoYYYYMM)) return false;

  const todasPac = await fetchTodasSesionesFijas(q => q.eq('paciente_id', uuidPaciente));
  const idsSnapshotMes = todasPac
    .filter(s => (s.estado || '').toUpperCase() === 'HISTORICO')
    .filter(s => {
      const m = parsearMetadataSesion(s);
      return m.categoria === 'HIST_MES' && m.periodo === periodoYYYYMM;
    })
    .map(s => s.id);

  // Solo sincronizamos si ese período ya fue consolidado previamente en el sistema
  const existeConsolidadoMes = idsSnapshotMes.length > 0 || (await fetchTodasSesionesFijas(q =>
    q.eq('estado', 'HISTORICO').like('observaciones', `${PREFIJO_HIST_MES}%`)
  )).some(s => parsearMetadataSesion(s).periodo === periodoYYYYMM);

  if (!existeConsolidadoMes) return false;

  if (idsSnapshotMes.length > 0) {
    const { error: errDel } = await supabase.from('sesiones_fijas').delete().in('id', idsSnapshotMes);
    if (errDel) throw errDel;
  }

  const activasVigentes = todasPac.filter(s => {
    if ((s.estado || 'ACTIVO').toUpperCase() !== 'ACTIVO') return false;
    const m = parsearMetadataSesion(s);
    const pDesde = (m.desde || (s.created_at ? String(s.created_at).slice(0, 10) : '2026-01-01')).slice(0, 7);
    return pDesde <= periodoYYYYMM;
  });

  if (activasVigentes.length > 0) {
    const obsSnapshot = construirObservacionHistMes(periodoYYYYMM, obtenerFechaHoyISO());
    const nuevos = activasVigentes.map(s => ({
      paciente_id: s.paciente_id,
      paciente_nombre: s.paciente_nombre,
      profesional_id: s.profesional_id,
      dia_semana: s.dia_semana,
      hora: s.hora,
      tipo_prestacion: s.tipo_prestacion || null,
      estado: 'HISTORICO',
      asistencia: 'Consolidado',
      observaciones: obsSnapshot
    }));
    const { error: errIns } = await supabase.from('sesiones_fijas').insert(nuevos);
    if (errIns) throw errIns;
  }

  return true;
}

/**
 * Consolida el estado actual de todas las sesiones ACTIVAS para un período YYYY-MM.
 * Si `sobreescribir` es true, reemplaza la consolidación previa de ese mes.
 */
export async function consolidarMesAgenda(periodoYYYYMM, { sobreescribir = false } = {}) {
  const hoy = obtenerFechaHoyISO();

  // 1. Verificar si ya existe consolidado de ese mes
  const existentesMes = await fetchTodasSesionesFijas(q =>
    q.eq('estado', 'HISTORICO').like('observaciones', `${PREFIJO_HIST_MES}%`)
  );

  const idsPreviosMes = existentesMes
    .filter(s => parsearMetadataSesion(s).periodo === periodoYYYYMM)
    .map(s => s.id);

  if (idsPreviosMes.length > 0 && !sobreescribir) {
    return { yaExistia: true, cantidad: idsPreviosMes.length, periodo: periodoYYYYMM };
  }

  // 2. Traer todas las sesiones ACTIVAS vigentes
  const activas = await fetchTodasSesionesFijas(q => q.eq('estado', 'ACTIVO'));

  if (idsPreviosMes.length > 0 && sobreescribir) {
    // Borrar en lotes por seguridad
    for (let i = 0; i < idsPreviosMes.length; i += 200) {
      const lote = idsPreviosMes.slice(i, i + 200);
      const { error: errDel } = await supabase.from('sesiones_fijas').delete().in('id', lote);
      if (errDel) throw errDel;
    }
  }

  if (activas.length === 0) {
    return { yaExistia: false, cantidad: 0, periodo: periodoYYYYMM };
  }

  const obsSnapshot = construirObservacionHistMes(periodoYYYYMM, hoy);
  const snapshots = activas.map(s => ({
    paciente_id: s.paciente_id,
    paciente_nombre: s.paciente_nombre,
    profesional_id: s.profesional_id,
    dia_semana: s.dia_semana,
    hora: s.hora,
    tipo_prestacion: s.tipo_prestacion || null,
    estado: 'HISTORICO',
    asistencia: 'Consolidado',
    observaciones: obsSnapshot
  }));

  for (let i = 0; i < snapshots.length; i += 200) {
    const lote = snapshots.slice(i, i + 200);
    const { error: errIns } = await supabase.from('sesiones_fijas').insert(lote);
    if (errIns) throw errIns;
  }

  return { yaExistia: false, cantidad: snapshots.length, periodo: periodoYYYYMM };
}

/**
 * Extrae el período YYYY-MM del concepto de una factura de Obra Social o de su fecha.
 * Ej: "Factura #... - Pac: X - Prestación: OS- CETTINE OCTUBRE 2026" => "2026-10"
 */
export function extraerPeriodoDeFacturaOS(concepto, fechaFallback = null) {
  const texto = String(concepto || '').toUpperCase();
  const regexMesAnio = /(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s*(?:DE\s*)?(\d{4})/i;
  const match = texto.match(regexMesAnio);
  if (match) {
    const mesNum = MESES_MAP[match[1].toUpperCase()];
    if (mesNum) return `${match[2]}-${mesNum}`;
  }

  const regexSoloMes = /\b(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\b/i;
  const matchMes = texto.match(regexSoloMes);
  if (matchMes) {
    const mesNum = MESES_MAP[matchMes[1].toUpperCase()];
    const anio = fechaFallback ? String(fechaFallback).slice(0, 4) : obtenerPeriodoActual().slice(0, 4);
    if (mesNum && /^\d{4}$/.test(anio)) return `${anio}-${mesNum}`;
  }

  if (fechaFallback && /^\d{4}-\d{2}/.test(String(fechaFallback))) {
    return String(fechaFallback).slice(0, 7);
  }
  return obtenerPeriodoActual();
}

/**
 * Dado un paciente (UUID) y un período YYYY-MM, resuelve qué sesiones fijas tenía en ese mes:
 * 1) Si existe Consolidado Mensual exacto (HIST_MES) para ese período -> devuelve ese snapshot (salvo si hubo un cambio posterior en el mismo mes y queremos avisar).
 * 2) Si no existe snapshot mensual exacto -> busca registros HIST_CAMBIO o VIGENCIA/ACTIVO cuyo rango [desde..hasta] cubra ese período.
 * 3) Fallback -> sesiones ACTIVAS actuales con advertencia de que no había historial para ese período antiguo.
 */
export async function obtenerSesionesPacienteParaPeriodo(uuidPaciente, periodoYYYYMM) {
  const todas = await fetchTodasSesionesFijas(q => q.eq('paciente_id', uuidPaciente));
  if (!todas || todas.length === 0) {
    return { sesiones: [], origen: 'SIN_SESIONES', periodo: periodoYYYYMM };
  }

  const activas = todas.filter(s => (s.estado || 'ACTIVO').toUpperCase() === 'ACTIVO');

  // 1. Buscar snapshot consolidado exacto del período
  const snapshotsMes = todas.filter(s => {
    if ((s.estado || '').toUpperCase() !== 'HISTORICO') return false;
    const meta = parsearMetadataSesion(s);
    return meta.categoria === 'HIST_MES' && meta.periodo === periodoYYYYMM;
  });

  const primerDiaMes = periodoYYYYMM ? `${periodoYYYYMM}-01` : '';
  const ultimoDiaMes = periodoYYYYMM ? obtenerUltimoDiaMesISO(periodoYYYYMM) : '';

  // También revisar si hubo cambios registrados dentro de ese mes exacto
  const cambiosEnMes = todas.filter(s => {
    if ((s.estado || '').toUpperCase() !== 'HISTORICO') return false;
    const meta = parsearMetadataSesion(s);
    if (meta.categoria !== 'HIST_CAMBIO') return false;
    if (meta.desde && meta.hasta && meta.desde === meta.hasta) return false;
    const pDesde = meta.periodo_desde || (meta.desde ? meta.desde.slice(0, 7) : '');
    const pHasta = meta.periodo_hasta || (meta.hasta ? meta.hasta.slice(0, 7) : '');
    return pDesde <= periodoYYYYMM && pHasta >= periodoYYYYMM;
  });

  const huboCambioMitadMes = Boolean(periodoYYYYMM && (
    cambiosEnMes.some(s => {
      const meta = parsearMetadataSesion(s);
      return meta.hasta && meta.hasta >= primerDiaMes && meta.hasta < ultimoDiaMes;
    }) ||
    activas.some(s => {
      const meta = parsearMetadataSesion(s);
      return meta.categoria === 'VIGENCIA' && meta.desde && meta.desde > primerDiaMes && meta.desde <= ultimoDiaMes;
    })
  ));

  if (snapshotsMes.length > 0) {
    return {
      sesiones: snapshotsMes,
      origen: 'CONSOLIDADO_MES',
      periodo: periodoYYYYMM,
      huboCambiosEnMes: huboCambioMitadMes
    };
  }

  // 2. Buscar por vigencia [desde..hasta] en HIST_CAMBIO + ACTIVAS
  if (periodoYYYYMM) {
    const vigentesEnPeriodo = [];

    cambiosEnMes.forEach(s => vigentesEnPeriodo.push(s));

    activas.forEach(s => {
      const meta = parsearMetadataSesion(s);
      const pDesde = (meta.desde || (s.created_at ? String(s.created_at).slice(0, 10) : '2026-01-01')).slice(0, 7);
      if (pDesde <= periodoYYYYMM) {
        vigentesEnPeriodo.push(s);
      }
    });

    if (vigentesEnPeriodo.length > 0) {
      return {
        sesiones: vigentesEnPeriodo,
        origen: huboCambioMitadMes ? 'CAMBIO_AGENDA' : 'ACTIVO_VIGENTE',
        periodo: periodoYYYYMM,
        huboCambiosEnMes: huboCambioMitadMes
      };
    }
  }

  // 3. Fallback a activas actuales (para facturas anteriores al inicio del historial)
  return {
    sesiones: activas,
    origen: 'ACTUAL_FALLBACK',
    periodo: periodoYYYYMM,
    huboCambiosEnMes: false
  };
}
