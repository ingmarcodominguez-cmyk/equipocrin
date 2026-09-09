import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Utilitario para parsear números decimales
const parsearDecimal = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/\$/g, '').trim();
  if (str.includes(',')) {
    const limpio = str.replace(/\./g, '').replace(',', '.');
    const num = Number(limpio);
    return isNaN(num) ? 0 : num;
  }
  if (str.includes('.')) {
    const partes = str.split('.');
    if (partes.length > 2) {
      const limpio = str.replace(/\./g, '');
      const num = Number(limpio);
      return isNaN(num) ? 0 : num;
    }
    const decimales = partes[1];
    if (decimales.length === 3) {
      const limpio = str.replace(/\./g, '');
      const num = Number(limpio);
      return isNaN(num) ? 0 : num;
    }
  }
  const num = Number(str);
  return isNaN(num) ? 0 : num;
};

// Nombres de meses en español
const nombresMeses = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const nombresDias = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
];

const normalizarTexto = (txt) => {
  if (!txt) return '';
  return txt.toLowerCase()
    .replace(/[\uFFFD]/g, 'n')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/([a-z])\1+/g, '$1')
    .trim();
};

const encontrarTodosAuxiliares = (usuarioNombre, listaAuxiliares) => {
  if (!usuarioNombre || !listaAuxiliares || listaAuxiliares.length === 0) return [];
  const userNorm = normalizarTexto(usuarioNombre);
  const userWords = userNorm.split(/\s+/).filter(w => w.length >= 2);

  const matched = [];

  for (const a of listaAuxiliares) {
    const auxNorm = normalizarTexto(a.nombre);
    const auxWords = auxNorm.split(/\s+/).filter(w => w.length >= 2);

    const isExact = (userNorm === auxNorm);
    const allWordsMatch = (userWords.length > 0 && userWords.every(w => auxWords.includes(w)));
    const twoWordsMatch = (userWords.filter(w => auxWords.includes(w)).length >= 2);
    const inverseAllMatch = (auxWords.length > 0 && auxWords.every(w => userWords.includes(w)));

    if (isExact || allWordsMatch || twoWordsMatch || inverseAllMatch) {
      if (!matched.some(m => m.id_auxiliar === a.id_auxiliar)) {
        matched.push(a);
      }
    }
  }

  return matched;
};

// Extraer lista de IDs de pacientes y limpiar texto de observaciones
const extraerDetallesObs = (obsText) => {
  if (!obsText) return { pacsIds: [], textoLimpio: '' };
  let pacsIds = [];
  let limpia = String(obsText);

  const matchP = limpia.match(/\[PACS:\s*([^\]]+)\]/i);
  if (matchP) {
    pacsIds = matchP[1]
      .split(',')
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n > 0);
    limpia = limpia.replace(matchP[0], '');
  }

  limpia = limpia.replace(/\[P_M:[^\]]+\]/gi, '').replace(/\[P_T:[^\]]+\]/gi, '').trim();
  return { pacsIds, textoLimpio: limpia };
};

export default function MiLiquidacionAuxiliar({ userData, onVolver, esModal = false, onCerrar }) {
  const rol = (userData?.rol || '').toUpperCase();
  const esSupervisor = ['ADMINISTRACION', 'DIRECCION'].includes(rol);

  // Fecha del sistema (respeta simulador si existe)
  const fechaTrabajoStr = localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0];
  const [anioActual, mesActual] = fechaTrabajoStr.split('-');
  const periodoActualDefecto = `${anioActual}-${mesActual}`;

  // Estados de datos del auxiliar
  const [cargandoAuxiliares, setCargandoAuxiliares] = useState(true);
  const [listaAuxiliares, setListaAuxiliares] = useState([]);
  const [misPerfiles, setMisPerfiles] = useState([]);
  const [miAuxiliar, setMiAuxiliar] = useState(null);
  const [errorVinculacion, setErrorVinculacion] = useState(null);

  // Maestro de pacientes para resolver nombres a partir de IDs
  const [mapaPacientes, setMapaPacientes] = useState({});
  const [modalPacientesData, setModalPacientesData] = useState(null);

  // Pestañas
  const [pestañaActiva, setPestañaActiva] = useState('mes_en_curso'); // 'mes_en_curso' o 'cuenta_corriente'

  // Datos del mes en curso / seleccionado
  const [mesSeleccionado, setMesSeleccionado] = useState(periodoActualDefecto);
  const [periodosDisponibles, setPeriodosDisponibles] = useState([]);
  const [asistenciasMes, setAsistenciasMes] = useState([]);
  const [cargandoMes, setCargandoMes] = useState(false);
  const [metricasMes, setMetricasMes] = useState({
    totalGanado: 0,
    diasTrabajados: 0,
    totalHoras: 0,
    totalSesiones: 0,
    tarifaUnitaria: 0,
    tipoLiq: 'HORA',
    esMesActual: true
  });

  // Datos de cuenta corriente y liquidaciones históricas
  const [movimientos, setMovimientos] = useState([]);
  const [liquidacionesHistoricas, setLiquidacionesHistoricas] = useState([]);
  const [saldoPendienteTotal, setSaldoPendienteTotal] = useState(0);
  const [cargandoCC, setCargandoCC] = useState(false);

  // Modal para ver detalle de asistencias de un mes histórico
  const [modalMesHistorico, setModalMesHistorico] = useState(null);
  const [cargandoDetalleHistorico, setCargandoDetalleHistorico] = useState(false);
  const [asistenciasHistorico, setAsistenciasHistorico] = useState([]);

  // 1. Inicializar auxiliares, pacientes y vincular identidad
  useEffect(() => {
    cargarAuxiliares();
    cargarPacientesMaestro();
    generarPeriodosDisponibles();
  }, [userData]);

  const cargarPacientesMaestro = async () => {
    try {
      const { data, error } = await supabase
        .from('pacientes_motor')
        .select('id_paciente, nombre_apellido, dni, obra_social');
      if (!error && data) {
        const map = {};
        data.forEach(p => {
          map[p.id_paciente] = p;
        });
        setMapaPacientes(map);
      }
    } catch (e) {
      console.error("Error al cargar maestro de pacientes:", e);
    }
  };

  // 2. Al cambiar el auxiliar activo o el mes seleccionado
  useEffect(() => {
    if (miAuxiliar) {
      cargarDatosMes(miAuxiliar, mesSeleccionado);
      cargarCuentaCorriente(miAuxiliar);
    }
  }, [miAuxiliar, mesSeleccionado]);

  // Generar lista de los últimos 12 meses
  const generarPeriodosDisponibles = () => {
    const lista = [];
    const baseDate = new Date(fechaTrabajoStr + 'T00:00:00');
    for (let i = 0; i < 12; i++) {
      const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const val = `${y}-${m}`;
      const nombre = `${nombresMeses[d.getMonth()]} ${y}`;
      lista.push({ valor: val, label: nombre });
    }
    setPeriodosDisponibles(lista);
  };

  const cargarAuxiliares = async () => {
    setCargandoAuxiliares(true);
    setErrorVinculacion(null);
    try {
      const { data, error } = await supabase
        .from('auxiliares_motor')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      const auxList = data || [];
      setListaAuxiliares(auxList);

      // Si es un auxiliar regular, vincular obligatoriamente su identidad
      if (!esSupervisor) {
        const matched = encontrarTodosAuxiliares(userData?.nombre, auxList);
        setMisPerfiles(matched);
        if (matched.length > 0) {
          let perfilActivo = matched[0];
          if (matched.length > 1) {
            try {
              const ids = matched.map(m => m.id_auxiliar);
              const { data: ultMovs } = await supabase
                .from('movauxiliares_motor')
                .select('id_auxiliar, fecha')
                .in('id_auxiliar', ids)
                .order('fecha', { ascending: false })
                .order('id_mov', { ascending: false })
                .limit(1);

              if (ultMovs && ultMovs.length > 0) {
                const found = matched.find(m => m.id_auxiliar === ultMovs[0].id_auxiliar);
                if (found) perfilActivo = found;
              } else {
                const horaProf = matched.find(m => m.tipo_liq === 'HORA');
                if (horaProf) perfilActivo = horaProf;
              }
            } catch (e) {
              console.error("Error al determinar perfil activo:", e);
            }
          }
          setMiAuxiliar(perfilActivo);
        } else {
          setErrorVinculacion(
            `No se encontró una cuenta de auxiliar vinculada al usuario "${userData?.nombre || 'Usuario'}". Por favor comuníquese con Administración para asociar su cuenta.`
          );
        }
      } else {
        // Si es supervisor (Dirección / Administración), vincular por defecto
        const matched = encontrarTodosAuxiliares(userData?.nombre, auxList);
        if (matched.length > 0) {
          setMisPerfiles(matched);
          const act = matched.find(m => m.tipo_liq === 'HORA') || matched[0];
          setMiAuxiliar(act);
        } else if (auxList.length > 0) {
          const primero = auxList[0];
          const todosPrimero = encontrarTodosAuxiliares(primero.nombre, auxList);
          setMisPerfiles(todosPrimero);
          setMiAuxiliar(primero);
        }
      }
    } catch (err) {
      console.error("Error al cargar auxiliares:", err);
      setErrorVinculacion("Error al conectar con el servidor: " + err.message);
    } finally {
      setCargandoAuxiliares(false);
    }
  };

  // Cargar asistencias y acumulación del mes seleccionado
  const cargarDatosMes = async (aux, periodoYYYYMM) => {
    if (!aux || !periodoYYYYMM) return;
    setCargandoMes(true);
    try {
      const [anio, mes] = periodoYYYYMM.split('-');
      const primerDia = `${anio}-${mes}-01`;
      const ultimoDiaVal = new Date(parseInt(anio), parseInt(mes), 0).getDate();
      const ultimoDia = `${anio}-${mes}-${String(ultimoDiaVal).padStart(2, '0')}`;
      const esMesActual = (periodoYYYYMM === periodoActualDefecto);

      // Consulta estricta filtrada por el ID del auxiliar logueado
      const { data: asistencias, error } = await supabase
        .from('asistencia_auxiliares_motor')
        .select('*')
        .eq('id_auxiliar', aux.id_auxiliar)
        .gte('fecha', primerDia)
        .lte('fecha', ultimoDia)
        .order('fecha', { ascending: true });

      if (error) throw error;

      const filas = asistencias || [];
      let totalHoras = 0;
      let totalSesiones = 0;
      let totalGanado = 0;
      let tarifaUnitaria = 0;

      if (aux.tipo_liq === 'FIJO') {
        tarifaUnitaria = parsearDecimal(aux.valor_hora || aux.valor_sesion) || 0;
        totalGanado = tarifaUnitaria;
      } else {
        filas.forEach(f => {
          if (aux.tipo_liq === 'HORA') {
            const hs = parsearDecimal(f.horas_trabajadas);
            const valH = parsearDecimal(f.valor_hora) || parsearDecimal(aux.valor_hora);
            totalHoras += hs;
            totalGanado += (hs * valH);
            tarifaUnitaria = valH;
          } else {
            const ses = parsearDecimal(f.sesiones);
            const valS = parsearDecimal(f.valor_sesion) || parsearDecimal(aux.valor_sesion);
            totalSesiones += ses;
            totalGanado += (ses * valS);
            tarifaUnitaria = valS;
          }
        });
      }

      setAsistenciasMes(filas);
      setMetricasMes({
        totalGanado,
        diasTrabajados: filas.length,
        totalHoras,
        totalSesiones,
        tarifaUnitaria,
        tipoLiq: aux.tipo_liq,
        esMesActual
      });
    } catch (err) {
      console.error("Error al cargar asistencias del mes:", err);
    } finally {
      setCargandoMes(false);
    }
  };

  // Cargar cuenta corriente y liquidaciones históricas
  const cargarCuentaCorriente = async (aux) => {
    if (!aux) return;
    setCargandoCC(true);
    try {
      // Consulta estricta filtrada por el ID del auxiliar logueado
      const { data, error } = await supabase
        .from('movauxiliares_motor')
        .select('*')
        .eq('id_auxiliar', aux.id_auxiliar)
        .order('fecha', { ascending: true })
        .order('id_mov', { ascending: true });

      if (error) throw error;

      const movs = data || [];
      let saldoAcumulado = 0;
      const movsConSaldo = movs.map(m => {
        const debe = parsearDecimal(m.debe) || 0;
        const haber = parsearDecimal(m.haber) || 0;
        saldoAcumulado += (debe - haber);
        return {
          ...m,
          debeNum: debe,
          haberNum: haber,
          saldoAcumulado
        };
      });

      setSaldoPendienteTotal(saldoAcumulado);
      // Invertir para mostrar primero los más recientes
      setMovimientos([...movsConSaldo].reverse());

      // Filtrar liquidaciones mensuales cerradas
      const liqs = movsConSaldo.filter(m => (m.concepto || '').toUpperCase().includes('LIQUIDACION'));
      setLiquidacionesHistoricas([...liqs].reverse());
    } catch (err) {
      console.error("Error al cargar cuenta corriente:", err);
    } finally {
      setCargandoCC(false);
    }
  };

  // Ver detalle de un mes cerrado histórico
  const abrirDetalleHistorico = async (periodoFormatoMMYYYY) => {
    if (!periodoFormatoMMYYYY || !miAuxiliar) return;
    let [mes, anio] = periodoFormatoMMYYYY.split('/');
    if (!anio || !mes) return;
    mes = mes.padStart(2, '0');
    const periodoYYYYMM = `${anio}-${mes}`;
    const nombreLabel = `${nombresMeses[parseInt(mes, 10) - 1]} ${anio}`;

    setModalMesHistorico({ periodo: periodoYYYYMM, label: nombreLabel });
    setCargandoDetalleHistorico(true);

    try {
      const primerDia = `${anio}-${mes}-01`;
      const ultimoDiaVal = new Date(parseInt(anio), parseInt(mes), 0).getDate();
      const ultimoDia = `${anio}-${mes}-${String(ultimoDiaVal).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('asistencia_auxiliares_motor')
        .select('*')
        .eq('id_auxiliar', miAuxiliar.id_auxiliar)
        .gte('fecha', primerDia)
        .lte('fecha', ultimoDia)
        .order('fecha', { ascending: true });

      if (error) throw error;
      setAsistenciasHistorico(data || []);
    } catch (err) {
      console.error("Error al cargar detalle histórico:", err);
    } finally {
      setCargandoDetalleHistorico(false);
    }
  };

  // Renderizar celda de observaciones con botón interactivo de pacientes si corresponde
  const renderCeldaObservaciones = (a) => {
    const { pacsIds, textoLimpio } = extraerDetallesObs(a.obs);
    if (pacsIds.length > 0) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const lista = pacsIds.map(id => mapaPacientes[id] || { id_paciente: id, nombre_apellido: `Paciente #${id}`, dni: 'S/D', obra_social: 'S/D' });
              const fechaObj = new Date(a.fecha + 'T00:00:00');
              const diaSem = nombresDias[fechaObj.getDay()] || '';
              const parts = a.fecha.split('-');
              const fechaFormat = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : a.fecha;
              setModalPacientesData({
                fecha: fechaFormat,
                diaSemana: diaSem,
                pacientes: lista,
                textoLimpio,
                totalSesiones: a.sesiones || pacsIds.length
              });
            }}
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: '#ffffff',
              border: '1px solid #38bdf8',
              padding: '5px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 'bold',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 5px rgba(2, 132, 199, 0.35)',
              transition: 'transform 0.15s'
            }}
            onMouseOver={(e) => e.currentTarget.style.filter = 'brightness(1.15)'}
            onMouseOut={(e) => e.currentTarget.style.filter = 'none'}
          >
            <span>👥</span> Ver {pacsIds.length} Paciente{pacsIds.length > 1 ? 's' : ''}
          </button>
          {textoLimpio && (
            <span style={{ fontSize: '11px', color: '#cbd5e1' }}>{textoLimpio}</span>
          )}
        </div>
      );
    }
    return <span style={{ color: '#94a3b8' }}>{textoLimpio || '-'}</span>;
  };

  // Exportar detalle diario a CSV / Excel
  const descargarDetalleMesCSV = () => {
    if (!asistenciasMes || asistenciasMes.length === 0) {
      alert("No hay jornadas registradas para exportar en este mes.");
      return;
    }

    const BOM = "\uFEFF";
    let csv = "Fecha;Dia;Turno Manana;Turno Tarde;Horas/Sesiones;Tarifa;Subtotal;Observaciones\r\n";

    asistenciasMes.forEach(a => {
      const fechaObj = new Date(a.fecha + 'T00:00:00');
      const diaSemana = nombresDias[fechaObj.getDay()] || '';
      const parts = a.fecha.split('-');
      const fechaStr = `${parts[2]}/${parts[1]}/${parts[0]}`;

      const manana = (a.hora_entrada_m && a.hora_salida_m) 
        ? `${a.hora_entrada_m.slice(0, 5)} - ${a.hora_salida_m.slice(0, 5)}` : '-';
      const tarde = (a.hora_entrada_t && a.hora_salida_t) 
        ? `${a.hora_entrada_t.slice(0, 5)} - ${a.hora_salida_t.slice(0, 5)}` : '-';

      const cant = miAuxiliar?.tipo_liq === 'HORA' 
        ? parsearDecimal(a.horas_trabajadas) 
        : parsearDecimal(a.sesiones);
      const tarifa = miAuxiliar?.tipo_liq === 'HORA' 
        ? parsearDecimal(a.valor_hora || miAuxiliar.valor_hora) 
        : parsearDecimal(a.valor_sesion || miAuxiliar.valor_sesion);
      const subtotal = cant * tarifa;

      const { pacsIds, textoLimpio } = extraerDetallesObs(a.obs);
      let obsFinal = textoLimpio;
      if (pacsIds.length > 0) {
        const nombresPacs = pacsIds.map(id => mapaPacientes[id]?.nombre_apellido?.trim() || ('#' + id)).join(', ');
        obsFinal = obsFinal ? `Pacientes: [${nombresPacs}] - ${obsFinal}` : `Pacientes: [${nombresPacs}]`;
      }
      const obsLimpia = (obsFinal || '').replace(/;/g, ',').replace(/\n/g, ' ');

      csv += `"${fechaStr}";"${diaSemana}";"${manana}";"${tarde}";"${cant}";"${tarifa.toFixed(2)}";"${subtotal.toFixed(2)}";"${obsLimpia}"\r\n`;
    });

    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Horas_${miAuxiliar.nombre.replace(/\s+/g, '_')}_${mesSeleccionado}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Exportar Cuenta Corriente a CSV / Excel
  const descargarCuentaCorrienteCSV = () => {
    if (!movimientos || movimientos.length === 0) {
      alert("No hay movimientos contables registrados para exportar.");
      return;
    }

    const BOM = "\uFEFF";
    let csv = "Fecha;Concepto;Periodo;Liquidado (Debe);Cobrado (Haber);Saldo Acumulado\r\n";

    [...movimientos].reverse().forEach(m => {
      const parts = (m.fecha || '').split('-');
      const fechaStr = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : m.fecha;
      const concepto = (m.concepto || '').replace(/;/g, ',');
      const periodo = (m.periodo || '-').replace(/;/g, ',');
      const debe = m.debeNum > 0 ? m.debeNum.toFixed(2).replace('.', ',') : '0,00';
      const haber = m.haberNum > 0 ? m.haberNum.toFixed(2).replace('.', ',') : '0,00';
      const saldo = m.saldoAcumulado.toFixed(2).replace('.', ',');

      csv += `"${fechaStr}";"${concepto}";"${periodo}";"${debe}";"${haber}";"${saldo}"\r\n`;
    });

    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Cuenta_Corriente_${miAuxiliar.nombre.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render principal
  const contenido = (
    <div style={{
      width: '100%',
      maxWidth: '1100px',
      margin: '0 auto',
      color: '#e2e8f0',
      fontFamily: 'Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, sans-serif',
      boxSizing: 'border-box'
    }}>
      {/* Barra superior de navegación / supervisor */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '15px',
        marginBottom: '20px',
        background: '#1e293b',
        padding: '16px 20px',
        borderRadius: '16px',
        border: '1px solid #334155'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {onVolver && !esModal && (
            <button
              onClick={onVolver}
              style={{
                background: '#334155',
                color: '#f8fafc',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              ← Volver
            </button>
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: '19px', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>💰</span> Mi Liquidación y Horas Trabajadas
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '4px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                Auxiliar: <strong style={{ color: '#38bdf8' }}>{miAuxiliar ? miAuxiliar.nombre : 'Buscando...'}</strong>
                {miAuxiliar && (
                  <span style={{
                    marginLeft: '8px',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    background: miAuxiliar.tipo_liq === 'FIJO' ? '#f59e0b' : '#0ea5e9',
                    color: '#fff'
                  }}>
                    MODALIDAD {miAuxiliar.tipo_liq}
                  </span>
                )}
              </p>

              {/* Botones para alternar entre modalidades si el auxiliar trabaja tanto por Horas como por Sesión */}
              {misPerfiles.length > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0f172a', padding: '3px 8px', borderRadius: '8px', border: '1px solid #334155' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 'bold' }}>Cambiar a:</span>
                  {misPerfiles.map(p => {
                    const activo = miAuxiliar?.id_auxiliar === p.id_auxiliar;
                    return (
                      <button
                        key={p.id_auxiliar}
                        onClick={() => setMiAuxiliar(p)}
                        style={{
                          padding: '3px 10px',
                          borderRadius: '6px',
                          border: activo ? '1px solid #10b981' : '1px solid #475569',
                          background: activo ? '#064e3b' : '#1e293b',
                          color: activo ? '#6ee7b7' : '#94a3b8',
                          fontWeight: 'bold',
                          fontSize: '11px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <span>{p.tipo_liq === 'HORA' ? '⏱️' : '📋'}</span>
                        {p.tipo_liq === 'HORA' ? 'Por Horas' : 'Por Sesiones'}
                        {activo && <span style={{ fontSize: '9px', background: '#10b981', color: '#000', padding: '0 4px', borderRadius: '3px', fontWeight: '900' }}>✓ ACTIVO</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Selector de previsualización para administradores / directores */}
        {esSupervisor && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#0f172a', padding: '8px 14px', borderRadius: '10px', border: '1px dashed #38bdf8' }}>
            <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 'bold' }}>👁️ Vista Supervisor:</span>
            <select
              value={miAuxiliar ? miAuxiliar.id_auxiliar : ''}
              onChange={(e) => {
                const target = listaAuxiliares.find(x => String(x.id_auxiliar) === String(e.target.value));
                if (target) {
                  setMiAuxiliar(target);
                  const related = encontrarTodosAuxiliares(target.nombre, listaAuxiliares);
                  setMisPerfiles(related);
                }
              }}
              style={{
                background: '#1e293b',
                color: '#fff',
                border: '1px solid #475569',
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                outline: 'none',
                fontWeight: '600'
              }}
            >
              {listaAuxiliares.map(a => (
                <option key={a.id_auxiliar} value={a.id_auxiliar}>
                  {a.nombre} ({a.tipo_liq})
                </option>
              ))}
            </select>
          </div>
        )}

        {esModal && onCerrar && (
          <button
            onClick={onCerrar}
            style={{
              background: 'transparent',
              color: '#94a3b8',
              border: 'none',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px 8px'
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Alerta de error de vinculación si no se encontró en la BD */}
      {errorVinculacion && (
        <div style={{
          background: '#450a0a',
          border: '1px solid #dc2626',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '20px',
          color: '#fecaca',
          fontSize: '14px',
          lineHeight: '1.5'
        }}>
          ⚠️ <strong>Cuenta no vinculada:</strong> {errorVinculacion}
        </div>
      )}

      {cargandoAuxiliares ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>⏳</div>
          Cargando su información personal...
        </div>
      ) : miAuxiliar ? (
        <>
          {/* Navegación por pestañas */}
          <div style={{
            display: 'flex',
            gap: '8px',
            borderBottom: '1px solid #334155',
            marginBottom: '20px',
            paddingBottom: '2px'
          }}>
            <button
              onClick={() => setPestañaActiva('mes_en_curso')}
              style={{
                padding: '12px 20px',
                border: 'none',
                background: pestañaActiva === 'mes_en_curso' ? '#10b981' : 'transparent',
                color: pestañaActiva === 'mes_en_curso' ? '#ffffff' : '#94a3b8',
                fontWeight: 'bold',
                fontSize: '14px',
                borderRadius: '10px 10px 0 0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <span>🕒</span> Mes en Curso (Acumulado hasta hoy)
            </button>
            <button
              onClick={() => setPestañaActiva('cuenta_corriente')}
              style={{
                padding: '12px 20px',
                border: 'none',
                background: pestañaActiva === 'cuenta_corriente' ? '#10b981' : 'transparent',
                color: pestañaActiva === 'cuenta_corriente' ? '#ffffff' : '#94a3b8',
                fontWeight: 'bold',
                fontSize: '14px',
                borderRadius: '10px 10px 0 0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              <span>📑</span> Liquidaciones y Cuenta Corriente
            </button>
          </div>

          {/* ========================================================= */}
          {/* PESTAÑA 1: MES EN CURSO (ACUMULADO EN TIEMPO REAL)        */}
          {/* ========================================================= */}
          {pestañaActiva === 'mes_en_curso' && (
            <div>
              {/* Barra de Filtro de Período y Acciones */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '20px',
                background: '#0f172a',
                padding: '14px 18px',
                borderRadius: '12px',
                border: '1px solid #334155'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <label style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 'bold' }}>
                    Consultar Mes:
                  </label>
                  <select
                    value={mesSeleccionado}
                    onChange={(e) => setMesSeleccionado(e.target.value)}
                    style={{
                      background: '#1e293b',
                      color: '#f8fafc',
                      border: '1px solid #475569',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      outline: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    {periodosDisponibles.map(p => (
                      <option key={p.valor} value={p.valor}>
                        {p.label} {p.valor === periodoActualDefecto ? '(Mes en Curso)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {metricasMes.esMesActual && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: '#064e3b',
                      color: '#6ee7b7',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      border: '1px solid #059669'
                    }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }}></span>
                      Tiempo Real al día de hoy ({(() => {
                        const [y, m, d] = fechaTrabajoStr.split('-');
                        return `${d}/${m}/${y}`;
                      })()})
                    </div>
                  )}

                  {asistenciasMes.length > 0 && (
                    <button
                      onClick={descargarDetalleMesCSV}
                      style={{
                        background: '#0284c7',
                        color: '#fff',
                        border: 'none',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      📥 Exportar Detalle (Excel)
                    </button>
                  )}
                </div>
              </div>

              {/* TARJETAS DE INDICADORES HERO */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
                marginBottom: '25px'
              }}>
                {/* 1. Total Acumulado */}
                <div style={{
                  background: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)',
                  padding: '20px',
                  borderRadius: '16px',
                  border: '1px solid #059669',
                  boxShadow: '0 8px 16px rgba(5, 150, 105, 0.15)'
                }}>
                  <span style={{ fontSize: '12px', color: '#a7f3d0', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    {metricasMes.esMesActual ? 'Total Trabajado Hasta Hoy' : 'Total Devengado en el Mes'}
                  </span>
                  <div style={{ fontSize: '28px', fontWeight: '900', color: '#ecfdf5', margin: '8px 0 4px 0' }}>
                    ${metricasMes.totalGanado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: '11px', color: '#6ee7b7' }}>
                    {metricasMes.esMesActual ? 'Acumulándose en el correr del mes' : 'Mes finalizado'}
                  </span>
                </div>

                {/* 2. Días y Jornadas */}
                <div style={{
                  background: '#1e293b',
                  padding: '20px',
                  borderRadius: '16px',
                  border: '1px solid #334155'
                }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    Jornadas Asistidas
                  </span>
                  <div style={{ fontSize: '28px', fontWeight: '900', color: '#38bdf8', margin: '8px 0 4px 0' }}>
                    {metricasMes.diasTrabajados} <span style={{ fontSize: '15px', fontWeight: 'normal' }}>días</span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    Registros cargados en el mes
                  </span>
                </div>

                {/* 3. Volumen Horas o Sesiones */}
                <div style={{
                  background: '#1e293b',
                  padding: '20px',
                  borderRadius: '16px',
                  border: '1px solid #334155'
                }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    {miAuxiliar.tipo_liq === 'HORA' ? 'Horas Computadas' : miAuxiliar.tipo_liq === 'SESION' ? 'Sesiones Realizadas' : 'Modalidad'}
                  </span>
                  <div style={{ fontSize: '28px', fontWeight: '900', color: '#f59e0b', margin: '8px 0 4px 0' }}>
                    {miAuxiliar.tipo_liq === 'HORA' ? (
                      `${metricasMes.totalHoras.toFixed(2)} hs`
                    ) : miAuxiliar.tipo_liq === 'SESION' ? (
                      `${metricasMes.totalSesiones} ses.`
                    ) : (
                      'Fijo Mensual'
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {miAuxiliar.tipo_liq === 'HORA'
                      ? `Tarifa: $${metricasMes.tarifaUnitaria.toLocaleString('es-AR')} / hora`
                      : miAuxiliar.tipo_liq === 'SESION'
                        ? `Tarifa: $${metricasMes.tarifaUnitaria.toLocaleString('es-AR')} / sesión`
                        : `Monto pactado: $${metricasMes.tarifaUnitaria.toLocaleString('es-AR')} / mes`}
                  </span>
                </div>

                {/* 4. Saldo Pendiente de Cobro */}
                <div style={{
                  background: '#1e293b',
                  padding: '20px',
                  borderRadius: '16px',
                  border: '1px solid #334155'
                }}>
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    Saldo Pendiente de Cobro
                  </span>
                  <div style={{
                    fontSize: '28px',
                    fontWeight: '900',
                    color: saldoPendienteTotal > 0 ? '#fbbf24' : '#10b981',
                    margin: '8px 0 4px 0'
                  }}>
                    ${saldoPendienteTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {saldoPendienteTotal > 0 ? 'Liquidaciones anteriores a percibir' : 'Al día / Sin saldo pendiente'}
                  </span>
                </div>
              </div>

              {/* TABLA DE ASISTENCIAS DETALLADAS DÍA POR DÍA */}
              <div style={{
                background: '#1e293b',
                borderRadius: '16px',
                border: '1px solid #334155',
                overflow: 'hidden',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#f8fafc', fontWeight: 'bold' }}>
                    📋 Desglose Diario de Jornadas Realizadas
                  </h3>
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    {asistenciasMes.length} jornada(s)
                  </span>
                </div>

                {cargandoMes ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    Cargando jornadas...
                  </div>
                ) : asistenciasMes.length === 0 ? (
                  <div style={{ padding: '50px 20px', textAlign: 'center', color: '#64748b' }}>
                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>🗓️</div>
                    <p style={{ margin: 0, fontSize: '15px', color: '#94a3b8' }}>
                      {metricasMes.esMesActual
                        ? 'Aún no se han registrado jornadas para el mes en curso.'
                        : 'No se registraron asistencias para el mes seleccionado.'}
                    </p>
                    {miAuxiliar.tipo_liq === 'FIJO' && (
                      <p style={{ fontSize: '13px', color: '#f59e0b', marginTop: '8px' }}>
                        * Tu modalidad es Monto Fijo Mensual ($ {metricasMes.tarifaUnitaria.toLocaleString('es-AR')}), por lo que se liquida mensualmente sin requerir registro diario de horas.
                      </p>
                    )}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                          <th style={{ padding: '12px 16px' }}>Fecha</th>
                          <th style={{ padding: '12px 16px' }}>Día</th>
                          {miAuxiliar.tipo_liq === 'HORA' && (
                            <>
                              <th style={{ padding: '12px 16px' }}>Turno Mañana</th>
                              <th style={{ padding: '12px 16px' }}>Turno Tarde</th>
                              <th style={{ padding: '12px 16px', textAlign: 'center' }}>Hs Computadas</th>
                            </>
                          )}
                          {miAuxiliar.tipo_liq === 'SESION' && (
                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Sesiones</th>
                          )}
                          <th style={{ padding: '12px 16px', textAlign: 'right' }}>Tarifa</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right' }}>Subtotal Ganado</th>
                          <th style={{ padding: '12px 16px' }}>{miAuxiliar.tipo_liq === 'SESION' ? 'Pacientes / Obs' : 'Observaciones'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asistenciasMes.map((a, idx) => {
                          const fechaObj = new Date(a.fecha + 'T00:00:00');
                          const diaSemana = nombresDias[fechaObj.getDay()] || '';
                          const parts = a.fecha.split('-');
                          const fechaFormateada = `${parts[2]}/${parts[1]}/${parts[0]}`;

                          const cant = miAuxiliar.tipo_liq === 'HORA'
                            ? parsearDecimal(a.horas_trabajadas)
                            : parsearDecimal(a.sesiones);

                          const tarifa = miAuxiliar.tipo_liq === 'HORA'
                            ? parsearDecimal(a.valor_hora || miAuxiliar.valor_hora)
                            : parsearDecimal(a.valor_sesion || miAuxiliar.valor_sesion);

                          const subtotal = cant * tarifa;

                          return (
                            <tr
                              key={a.id_registro || idx}
                              style={{
                                borderBottom: '1px solid #334155',
                                background: idx % 2 === 0 ? '#1e293b' : '#172554'
                              }}
                            >
                              <td style={{ padding: '12px 16px', fontWeight: 'bold', color: '#f8fafc' }}>
                                {fechaFormateada}
                              </td>
                              <td style={{ padding: '12px 16px', color: '#94a3b8' }}>
                                {diaSemana}
                              </td>

                              {miAuxiliar.tipo_liq === 'HORA' && (
                                <>
                                  <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                                    {a.hora_entrada_m && a.hora_salida_m ? (
                                      <span style={{ background: '#0f172a', padding: '3px 8px', borderRadius: '4px' }}>
                                        {a.hora_entrada_m.slice(0, 5)} - {a.hora_salida_m.slice(0, 5)}
                                      </span>
                                    ) : '-'}
                                  </td>
                                  <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                                    {a.hora_entrada_t && a.hora_salida_t ? (
                                      <span style={{ background: '#0f172a', padding: '3px 8px', borderRadius: '4px' }}>
                                        {a.hora_entrada_t.slice(0, 5)} - {a.hora_salida_t.slice(0, 5)}
                                      </span>
                                    ) : '-'}
                                  </td>
                                  <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 'bold', color: '#38bdf8' }}>
                                    {cant.toFixed(2)} hs
                                  </td>
                                </>
                              )}

                              {miAuxiliar.tipo_liq === 'SESION' && (
                                <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 'bold', color: '#38bdf8' }}>
                                  {cant} ses.
                                </td>
                              )}

                              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#94a3b8' }}>
                                ${tarifa.toLocaleString('es-AR')}
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: '#34d399' }}>
                                ${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </td>
                              <td style={{ padding: '12px 16px' }}>
                                {renderCeldaObservaciones(a)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#0f172a', borderTop: '2px solid #334155', fontWeight: 'bold' }}>
                          <td colSpan={miAuxiliar.tipo_liq === 'HORA' ? 4 : 2} style={{ padding: '14px 16px', color: '#f8fafc' }}>
                            TOTAL ACUMULADO DEL PERÍODO
                          </td>
                          {miAuxiliar.tipo_liq === 'HORA' && (
                            <td style={{ padding: '14px 16px', textAlign: 'center', color: '#38bdf8' }}>
                              {metricasMes.totalHoras.toFixed(2)} hs
                            </td>
                          )}
                          {miAuxiliar.tipo_liq === 'SESION' && (
                            <td style={{ padding: '14px 16px', textAlign: 'center', color: '#38bdf8' }}>
                              {metricasMes.totalSesiones} ses.
                            </td>
                          )}
                          <td style={{ padding: '14px 16px' }}></td>
                          <td style={{ padding: '14px 16px', textAlign: 'right', color: '#10b981', fontSize: '15px' }}>
                            ${metricasMes.totalGanado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* PESTAÑA 2: LIQUIDACIONES HISTÓRICAS Y CUENTA CORRIENTE    */}
          {/* ========================================================= */}
          {pestañaActiva === 'cuenta_corriente' && (
            <div>
              {/* Tarjeta de Resumen de Saldo */}
              <div style={{
                background: saldoPendienteTotal > 0
                  ? 'linear-gradient(135deg, #78350f 0%, #451a03 100%)'
                  : 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)',
                padding: '24px',
                borderRadius: '16px',
                border: saldoPendienteTotal > 0 ? '1px solid #d97706' : '1px solid #059669',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '15px',
                marginBottom: '25px',
                boxShadow: '0 8px 20px rgba(0,0,0,0.2)'
              }}>
                <div>
                  <span style={{ fontSize: '13px', color: saldoPendienteTotal > 0 ? '#fde68a' : '#a7f3d0', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    Estado de Saldo en Cuenta Corriente
                  </span>
                  <div style={{ fontSize: '36px', fontWeight: '900', color: '#ffffff', margin: '6px 0 4px 0' }}>
                    ${saldoPendienteTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: '12px', color: saldoPendienteTotal > 0 ? '#fde68a' : '#6ee7b7' }}>
                    {saldoPendienteTotal > 0
                      ? '⚠️ Importe total pendiente de pago a tu favor'
                      : '✅ Todas tus liquidaciones han sido abonadas en su totalidad'}
                  </span>
                </div>

                <button
                  onClick={descargarCuentaCorrienteCSV}
                  style={{
                    background: '#ffffff',
                    color: '#0f172a',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: '10px',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                  }}
                >
                  📥 Descargar Extracto (Excel)
                </button>
              </div>

              {/* SECCIÓN 1: LIQUIDACIONES MENSUALES CERRADAS */}
              <div style={{
                background: '#1e293b',
                borderRadius: '16px',
                border: '1px solid #334155',
                marginBottom: '25px',
                overflow: 'hidden'
              }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#f8fafc', fontWeight: 'bold' }}>
                    📅 Historial de Liquidaciones Mensuales Cerradas
                  </h3>
                </div>

                {liquidacionesHistoricas.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                    No hay liquidaciones cerradas registradas todavía.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                          <th style={{ padding: '12px 16px' }}>Período</th>
                          <th style={{ padding: '12px 16px' }}>Fecha Liquidación</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right' }}>Monto Liquidado</th>
                          <th style={{ padding: '12px 16px', textAlign: 'center' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {liquidacionesHistoricas.map((l, idx) => {
                          const parts = (l.fecha || '').split('-');
                          const fechaLiq = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : l.fecha;
                          const periodoFormateado = l.periodo || 'S/D';

                          return (
                            <tr key={l.id_mov || idx} style={{ borderBottom: '1px solid #334155' }}>
                              <td style={{ padding: '12px 16px', fontWeight: 'bold', color: '#38bdf8' }}>
                                🗓️ Mes {periodoFormateado}
                              </td>
                              <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                                {fechaLiq}
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: '#34d399' }}>
                                ${l.debeNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                <button
                                  onClick={() => abrirDetalleHistorico(l.periodo)}
                                  style={{
                                    background: '#0284c7',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '5px 12px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '12px',
                                    fontWeight: 'bold'
                                  }}
                                >
                                  🔍 Ver Jornadas de este Mes
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* SECCIÓN 2: EXTRACTO COMPLETO DE CUENTA CORRIENTE (PAGOS, LIQUIDACIONES, AJUSTES) */}
              <div style={{
                background: '#1e293b',
                borderRadius: '16px',
                border: '1px solid #334155',
                overflow: 'hidden'
              }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#f8fafc', fontWeight: 'bold' }}>
                    📊 Extracto Cronológico de Movimientos y Pagos
                  </h3>
                </div>

                {cargandoCC ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                    Cargando movimientos...
                  </div>
                ) : movimientos.length === 0 ? (
                  <div style={{ padding: '30px', textAlign: 'center', color: '#64748b' }}>
                    No hay movimientos registrados en la cuenta corriente.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
                          <th style={{ padding: '12px 16px' }}>Fecha</th>
                          <th style={{ padding: '12px 16px' }}>Concepto</th>
                          <th style={{ padding: '12px 16px' }}>Período</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right' }}>Liquidado / A favor (+)</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right' }}>Pagado / Percibido (-)</th>
                          <th style={{ padding: '12px 16px', textAlign: 'right' }}>Saldo Acumulado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movimientos.map((m, idx) => {
                          const parts = (m.fecha || '').split('-');
                          const fechaStr = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : m.fecha;
                          const esPago = (m.concepto || '').toUpperCase().includes('PAGO');
                          const esLiq = (m.concepto || '').toUpperCase().includes('LIQUIDACION');

                          return (
                            <tr key={m.id_mov || idx} style={{ borderBottom: '1px solid #334155' }}>
                              <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                                {fechaStr}
                              </td>
                              <td style={{ padding: '12px 16px', fontWeight: '600' }}>
                                <span style={{
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  fontWeight: 'bold',
                                  background: esPago ? '#064e3b' : esLiq ? '#1e3a8a' : '#374151',
                                  color: esPago ? '#6ee7b7' : esLiq ? '#93c5fd' : '#f3f4f6',
                                  marginRight: '6px'
                                }}>
                                  {esPago ? 'PAGO' : esLiq ? 'LIQUIDACIÓN' : 'AJUSTE'}
                                </span>
                                {m.concepto}
                              </td>
                              <td style={{ padding: '12px 16px', color: '#94a3b8' }}>
                                {m.periodo || '-'}
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: m.debeNum > 0 ? '#34d399' : '#64748b' }}>
                                {m.debeNum > 0 ? `$${m.debeNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: m.haberNum > 0 ? '#38bdf8' : '#64748b' }}>
                                {m.haberNum > 0 ? `$${m.haberNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                              </td>
                              <td style={{
                                padding: '12px 16px',
                                textAlign: 'right',
                                fontWeight: 'bold',
                                color: m.saldoAcumulado > 0 ? '#fbbf24' : '#10b981'
                              }}>
                                ${m.saldoAcumulado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MODAL: VER DETALLE DE ASISTENCIAS DE UN MES HISTÓRICO     */}
          {/* ========================================================= */}
          {modalMesHistorico && (
            <div style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.8)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 99999,
              padding: '20px'
            }}>
              <div style={{
                background: '#1e293b',
                color: '#f8fafc',
                borderRadius: '16px',
                maxWidth: '800px',
                width: '100%',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid #334155',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)'
              }}>
                <div style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <h3 style={{ margin: 0, fontSize: '17px', color: '#38bdf8' }}>
                    🔍 Jornadas de {modalMesHistorico.label} ({miAuxiliar.nombre})
                  </h3>
                  <button
                    onClick={() => setModalMesHistorico(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '20px',
                      cursor: 'pointer'
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                  {cargandoDetalleHistorico ? (
                    <p style={{ textAlign: 'center', color: '#94a3b8' }}>Cargando detalle del mes...</p>
                  ) : asistenciasHistorico.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#94a3b8' }}>
                      No se encontraron registros de jornadas individuales para este período.
                    </p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                          <th style={{ padding: '10px' }}>Fecha</th>
                          <th style={{ padding: '10px' }}>Horario</th>
                          <th style={{ padding: '10px', textAlign: 'center' }}>Hs / Ses</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Subtotal</th>
                          <th style={{ padding: '10px' }}>{miAuxiliar.tipo_liq === 'SESION' ? 'Pacientes / Obs' : 'Observaciones'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asistenciasHistorico.map((a, i) => {
                          const cant = miAuxiliar.tipo_liq === 'HORA' ? parsearDecimal(a.horas_trabajadas) : parsearDecimal(a.sesiones);
                          const tarifa = miAuxiliar.tipo_liq === 'HORA' ? parsearDecimal(a.valor_hora || miAuxiliar.valor_hora) : parsearDecimal(a.valor_sesion || miAuxiliar.valor_sesion);
                          const sub = cant * tarifa;
                          const horario = (a.hora_entrada_m && a.hora_salida_m) 
                            ? `${a.hora_entrada_m.slice(0,5)}-${a.hora_salida_m.slice(0,5)}` 
                            : (a.hora_entrada_t && a.hora_salida_t) 
                              ? `${a.hora_entrada_t.slice(0,5)}-${a.hora_salida_t.slice(0,5)}` 
                              : '-';

                          return (
                            <tr key={i} style={{ borderBottom: '1px solid #334155' }}>
                              <td style={{ padding: '10px', fontWeight: 'bold' }}>{a.fecha}</td>
                              <td style={{ padding: '10px', color: '#cbd5e1' }}>{horario}</td>
                              <td style={{ padding: '10px', textAlign: 'center', color: '#38bdf8' }}>{cant}</td>
                              <td style={{ padding: '10px', textAlign: 'right', color: '#34d399', fontWeight: 'bold' }}>${sub.toLocaleString('es-AR')}</td>
                              <td style={{ padding: '10px' }}>{renderCeldaObservaciones(a)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                <div style={{ padding: '14px 20px', borderTop: '1px solid #334155', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setModalMesHistorico(null)}
                    style={{
                      background: '#334155',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 18px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold'
                    }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* MODAL EMERGENTE: DETALLE DE PACIENTES ATENDIDOS EN EL DÍA */}
          {/* ========================================================= */}
          {modalPacientesData && (
            <div style={{
              position: 'fixed',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(0,0,0,0.85)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 100000,
              padding: '15px'
            }}>
              <div style={{
                background: '#1e293b',
                color: '#f8fafc',
                borderRadius: '16px',
                maxWidth: '650px',
                width: '100%',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid #38bdf8',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)'
              }}>
                {/* Header del modal */}
                <div style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #334155',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#0f172a',
                  borderRadius: '16px 16px 0 0'
                }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>👥</span> Pacientes Atendidos
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8' }}>
                      {modalPacientesData.diaSemana} {modalPacientesData.fecha} • <strong style={{ color: '#34d399' }}>{modalPacientesData.pacientes.length} paciente(s) / sesiones</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => setModalPacientesData(null)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '22px',
                      cursor: 'pointer',
                      padding: '4px 8px'
                    }}
                  >
                    ✕
                  </button>
                </div>

                {/* Lista de pacientes */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                        <th style={{ padding: '10px 12px', width: '40px' }}>#</th>
                        <th style={{ padding: '10px 12px' }}>Paciente</th>
                        <th style={{ padding: '10px 12px' }}>DNI</th>
                        <th style={{ padding: '10px 12px' }}>Obra Social</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalPacientesData.pacientes.map((p, idx) => (
                        <tr
                          key={p.id_paciente || idx}
                          style={{
                            borderBottom: '1px solid #334155',
                            background: idx % 2 === 0 ? '#1e293b' : '#172554'
                          }}
                        >
                          <td style={{ padding: '10px 12px', color: '#64748b', fontWeight: 'bold' }}>
                            {idx + 1}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#f8fafc' }}>
                            👤 {p.nombre_apellido}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>
                            {p.dni || 'S/D'}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                            {p.obra_social || 'S/D'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {modalPacientesData.textoLimpio && (
                    <div style={{
                      marginTop: '16px',
                      padding: '12px 16px',
                      background: '#0f172a',
                      borderRadius: '10px',
                      border: '1px solid #334155',
                      fontSize: '12px',
                      color: '#cbd5e1'
                    }}>
                      <strong style={{ color: '#38bdf8' }}>Observación del día:</strong> {modalPacientesData.textoLimpio}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div style={{
                  padding: '14px 20px',
                  borderTop: '1px solid #334155',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  background: '#0f172a',
                  borderRadius: '0 0 16px 16px'
                }}>
                  <button
                    onClick={() => setModalPacientesData(null)}
                    style={{
                      background: '#334155',
                      color: '#fff',
                      border: 'none',
                      padding: '8px 20px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '13px'
                    }}
                  >
                    Cerrar
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );

  // Si se solicita en modo modal (overlay flotante)
  if (esModal) {
    return (
      <div style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.85)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 99990,
        padding: '15px'
      }}>
        <div style={{
          background: '#0f172a',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '1150px',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '20px',
          border: '1px solid #334155',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)'
        }}>
          {contenido}
        </div>
      </div>
    );
  }

  return contenido;
}
