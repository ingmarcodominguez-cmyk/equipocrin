import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

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
    
    const num = Number(str);
    return isNaN(num) ? 0 : num;
  }
  
  const num = Number(str);
  return isNaN(num) ? 0 : num;
};

const nombresMeses = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const formatearMesLabel = (periodoYYYYMM) => {
  if (!periodoYYYYMM || !periodoYYYYMM.includes('-')) return periodoYYYYMM || '';
  const [anio, mes] = periodoYYYYMM.split('-');
  const idx = parseInt(mes, 10) - 1;
  return `${nombresMeses[idx] || mes} ${anio}`;
};

export default function LiquidacionAuxiliares({ onVolver, usuario }) {
  // Pestañas principales
  const [subVista, setSubVista] = useState('cierre_mensual'); // 'cierre_mensual', 'cuenta_corriente', 'descuentos'

  // Períodos y Cierre Mensual
  const [periodosDisponibles, setPeriodosDisponibles] = useState([]);
  const [mesSeleccionado, setMesSeleccionado] = useState('2026-08');
  const [cargandoMes, setCargandoMes] = useState(false);
  const [filasMes, setFilasMes] = useState([]);
  const [procesandoAccion, setProcesandoAccion] = useState(false);
  const [modalDetalleDias, setModalDetalleDias] = useState(null); // { auxiliar, asistencias }

  // Cuenta Corriente por Auxiliar
  const [auxiliares, setAuxiliares] = useState([]);
  const [auxiliarSeleccionado, setAuxiliarSeleccionado] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [cargandoAuxiliares, setCargandoAuxiliares] = useState(false);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);

  // Modales de transacción (Pagos y Ajustes)
  const [modalAbierto, setModalAbierto] = useState(null); // 'pago', 'ajuste'
  const [fechaTx, setFechaTx] = useState('');
  const [montoTx, setMontoTx] = useState('');
  const [conceptoTx, setConceptoTx] = useState('');
  const [periodoTx, setPeriodoTx] = useState('');
  const [tipoAjuste, setTipoAjuste] = useState('credito');
  const [procesandoTx, setProcesandoTx] = useState(false);

  // Descuentos a Prestadores
  const [descuentosPrestadores, setDescuentosPrestadores] = useState([]);
  const [cargandoDescuentos, setCargandoDescuentos] = useState(false);

  // Notificaciones
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  const mostrarAlerta = (texto, tipo = 'exito') => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4500);
  };

  const fechaTrabajo = localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0];

  // 1. Inicialización
  useEffect(() => {
    inicializarDatos();
  }, []);

  // 2. Al cambiar el mes seleccionado en Cierre Mensual o Descuentos
  useEffect(() => {
    if (mesSeleccionado) {
      cargarCierreMensual(mesSeleccionado);
      cargarDescuentosPrestadores(mesSeleccionado);
    }
  }, [mesSeleccionado]);

  // 3. Al cambiar el auxiliar seleccionado en Cuenta Corriente
  useEffect(() => {
    if (auxiliarSeleccionado) {
      cargarMovimientos(auxiliarSeleccionado.id_auxiliar);
    } else {
      setMovimientos([]);
    }
  }, [auxiliarSeleccionado]);

  const inicializarDatos = async () => {
    await cargarAuxiliares();
    await cargarPeriodosDisponibles();
  };

  // Cargar lista unificada de períodos
  const cargarPeriodosDisponibles = async () => {
    try {
      // Períodos desde asistencias
      const { data: asistData } = await supabase
        .from('asistencia_auxiliares_motor')
        .select('fecha');

      const mesesAsist = (asistData || [])
        .map(a => a.fecha ? a.fecha.substring(0, 7) : null)
        .filter(Boolean);

      // Períodos desde movimientos contables
      const { data: movsData } = await supabase
        .from('movauxiliares_motor')
        .select('periodo');

      const mesesMovs = (movsData || [])
        .map(m => {
          if (!m.periodo) return null;
          if (m.periodo.includes('/')) {
            const [mes, anio] = m.periodo.split('/');
            return `${anio}-${mes.padStart(2, '0')}`;
          }
          return null;
        })
        .filter(Boolean);

      // Mes simulado / actual
      const mesActual = fechaTrabajo.substring(0, 7);

      const todos = [...new Set([...mesesAsist, ...mesesMovs, mesActual, '2026-08', '2026-09'])].filter(Boolean);
      todos.sort().reverse();

      setPeriodosDisponibles(todos);

      if (!mesSeleccionado && todos.length > 0) {
        setMesSeleccionado(todos[0]);
      }
    } catch (err) {
      console.error("Error al cargar períodos disponibles:", err);
    }
  };

  // Cargar auxiliares y sus saldos consolidados
  const cargarAuxiliares = async () => {
    setCargandoAuxiliares(true);
    try {
      const { data: listaAux, error: errA } = await supabase
        .from('auxiliares_motor')
        .select('*')
        .order('nombre', { ascending: true });

      if (errA) throw errA;

      // Cargar movimientos para calcular saldos
      let listaMovs = [];
      let from = 0;
      let to = 999;
      let keepFetching = true;
      
      while (keepFetching) {
        const { data, error } = await supabase
          .from('movauxiliares_motor')
          .select('id_auxiliar, debe, haber')
          .range(from, to);
          
        if (error) throw error;
        listaMovs = listaMovs.concat(data || []);
        
        if (!data || data.length < 1000) {
          keepFetching = false;
        } else {
          from += 1000;
          to += 1000;
        }
      }

      const saldosMapa = {};
      (listaMovs || []).forEach(m => {
        const id = m.id_auxiliar;
        const debeVal = parsearDecimal(m.debe) || 0;
        const haberVal = parsearDecimal(m.haber) || 0;
        if (!saldosMapa[id]) saldosMapa[id] = 0;
        saldosMapa[id] += (debeVal - haberVal);
      });

      const auxiliaresConSaldos = (listaAux || []).map(a => ({
        ...a,
        saldoConsolidado: saldosMapa[a.id_auxiliar] || 0
      }));

      setAuxiliares(auxiliaresConSaldos);

      if (auxiliarSeleccionado) {
        const actualizado = auxiliaresConSaldos.find(x => x.id_auxiliar === auxiliarSeleccionado.id_auxiliar);
        if (actualizado) setAuxiliarSeleccionado(actualizado);
      }
    } catch (error) {
      console.error("Error al cargar auxiliares:", error);
      mostrarAlerta("Error al cargar auxiliares: " + error.message, "error");
    } finally {
      setCargandoAuxiliares(false);
    }
  };

  // Cargar extracto contable del auxiliar seleccionado
  const cargarMovimientos = async (idAuxiliar) => {
    setCargandoMovimientos(true);
    try {
      const { data, error } = await supabase
        .from('movauxiliares_motor')
        .select('*')
        .eq('id_auxiliar', idAuxiliar)
        .order('fecha', { ascending: true })
        .order('id_mov', { ascending: true });

      if (error) throw error;

      let saldoAcumulado = 0;
      const conSaldo = (data || []).map(m => {
        const debe = parsearDecimal(m.debe) || 0;
        const haber = parsearDecimal(m.haber) || 0;
        saldoAcumulado += (debe - haber);
        return {
          ...m,
          saldoAcumulado
        };
      });

      setMovimientos(conSaldo.reverse());
    } catch (error) {
      console.error("Error al cargar movimientos:", error);
      mostrarAlerta("Error al cargar extracto contable.", "error");
    } finally {
      setCargandoMovimientos(false);
    }
  };

  // =========================================================================
  // LOGICA PRINCIPAL: CIERRE Y LIQUIDACIÓN MENSUAL
  // =========================================================================
  const cargarCierreMensual = async (periodoYYYYMM) => {
    if (!periodoYYYYMM) return;
    setCargandoMes(true);
    try {
      const [anio, mes] = periodoYYYYMM.split('-');
      const primerDia = `${anio}-${mes}-01`;
      const ultimoDiaVal = new Date(parseInt(anio), parseInt(mes), 0).getDate();
      const ultimoDia = `${anio}-${mes}-${String(ultimoDiaVal).padStart(2, '0')}`;
      const periodoFormateado = `${mes}/${anio}`;

      // 1. Obtener todas las asistencias del mes
      const { data: asistencias, error: errAsist } = await supabase
        .from('asistencia_auxiliares_motor')
        .select('*')
        .gte('fecha', primerDia)
        .lte('fecha', ultimoDia)
        .order('fecha', { ascending: true });

      if (errAsist) throw errAsist;

      // 2. Obtener las liquidaciones ya registradas para este período
      const { data: liquidacionesRegistradas, error: errLiq } = await supabase
        .from('movauxiliares_motor')
        .select('*')
        .eq('concepto', 'LIQUIDACION')
        .eq('periodo', periodoFormateado);

      if (errLiq) throw errLiq;

      const mapaLiquidaciones = {};
      (liquidacionesRegistradas || []).forEach(l => {
        mapaLiquidaciones[l.id_auxiliar] = l;
      });

      // 3. Agrupar asistencias por auxiliar
      const agrupado = {};
      (asistencias || []).forEach(a => {
        const id = a.id_auxiliar;
        if (!agrupado[id]) {
          agrupado[id] = {
            id_auxiliar: id,
            nombre: a.nombre || 'AUXILIAR',
            tipo_liq: a.tipo_liq || 'HORA',
            dias: 0,
            totalHoras: 0,
            totalSesiones: 0,
            totalCalculado: 0,
            tarifa: a.tipo_liq === 'HORA' ? parsearDecimal(a.valor_hora) : parsearDecimal(a.valor_sesion),
            asistencias: []
          };
        }

        agrupado[id].dias += 1;
        agrupado[id].asistencias.push(a);

        const tarifaFila = a.tipo_liq === 'HORA' ? parsearDecimal(a.valor_hora) || 0 : parsearDecimal(a.valor_sesion) || 0;
        const cantFila = a.tipo_liq === 'HORA' ? parsearDecimal(a.horas_trabajadas) || 0 : parsearDecimal(a.sesiones) || 0;

        if (a.tipo_liq === 'HORA') {
          agrupado[id].totalHoras += cantFila;
        } else {
          agrupado[id].totalSesiones += cantFila;
        }

        agrupado[id].totalCalculado += (tarifaFila * cantFila);
      });

      // 4. Armar filas finales con estado de liquidación
      const listaFilas = Object.values(agrupado).map(item => {
        const movLiq = mapaLiquidaciones[item.id_auxiliar] || null;
        return {
          ...item,
          liquidado: !!movLiq,
          movLiquidacion: movLiq
        };
      });

      // Ordenar alfabéticamente por nombre
      listaFilas.sort((a, b) => a.nombre.localeCompare(b.nombre));

      setFilasMes(listaFilas);
    } catch (err) {
      console.error("Error al cargar cierre mensual:", err);
      mostrarAlerta("Error al cargar asistencias del mes: " + err.message, "error");
    } finally {
      setCargandoMes(false);
    }
  };

  // Obtener próximo ID de movimiento
  const obtenerProximoIdMov = async () => {
    const { data, error } = await supabase
      .from('movauxiliares_motor')
      .select('id_mov')
      .order('id_mov', { ascending: false })
      .limit(1);

    if (error) throw error;
    return (data && data[0]?.id_mov ? data[0].id_mov : 0) + 1;
  };

  // Liquidar un auxiliar individualmente
  const liquidarAuxiliar = async (fila) => {
    if (fila.liquidado) {
      alert(`Este auxiliar ya fue liquidado para este período.`);
      return;
    }

    if (fila.totalCalculado <= 0) {
      alert(`El monto a liquidar debe ser mayor a cero.`);
      return;
    }

    setProcesandoAccion(true);
    try {
      const [anio, mes] = mesSeleccionado.split('-');
      const periodoFormateado = `${mes}/${anio}`;
      const nextId = await obtenerProximoIdMov();

      const nuevoMov = {
        id_mov: nextId,
        id_auxiliar: fila.id_auxiliar,
        fecha: fechaTrabajo,
        concepto: 'LIQUIDACION',
        periodo: periodoFormateado,
        debe: fila.totalCalculado,
        haber: 0,
        saldo: 0,
        fecha_registro: new Date().toISOString()
      };

      const { error } = await supabase
        .from('movauxiliares_motor')
        .insert([nuevoMov]);

      if (error) throw error;

      mostrarAlerta(`Liquidación de ${fila.nombre} ($${fila.totalCalculado.toLocaleString('es-AR')}) guardada con éxito.`, "exito");
      await cargarCierreMensual(mesSeleccionado);
      await cargarAuxiliares();
      if (auxiliarSeleccionado && auxiliarSeleccionado.id_auxiliar === fila.id_auxiliar) {
        await cargarMovimientos(fila.id_auxiliar);
      }
    } catch (err) {
      console.error("Error al liquidar auxiliar:", err);
      alert("Error al registrar liquidación: " + err.message);
    } finally {
      setProcesandoAccion(false);
    }
  };

  // Anular liquidación de un auxiliar
  const anularLiquidacion = async (fila) => {
    if (!fila.movLiquidacion) return;

    const confirmar = window.confirm(
      `¿Está seguro de que desea anular la liquidación de "${fila.nombre}" para ${formatearMesLabel(mesSeleccionado)}?\n\n` +
      `Se eliminará el movimiento contable de $${fila.totalCalculado.toLocaleString('es-AR')} de su cuenta corriente y quedará en estado PENDIENTE.`
    );

    if (!confirmar) return;

    setProcesandoAccion(true);
    try {
      const { error } = await supabase
        .from('movauxiliares_motor')
        .delete()
        .eq('id_mov', fila.movLiquidacion.id_mov);

      if (error) throw error;

      mostrarAlerta(`Liquidación de ${fila.nombre} anulada correctamente.`, "exito");
      await cargarCierreMensual(mesSeleccionado);
      await cargarAuxiliares();
      if (auxiliarSeleccionado && auxiliarSeleccionado.id_auxiliar === fila.id_auxiliar) {
        await cargarMovimientos(fila.id_auxiliar);
      }
    } catch (err) {
      console.error("Error al anular liquidación:", err);
      alert("Error al anular liquidación: " + err.message);
    } finally {
      setProcesandoAccion(false);
    }
  };

  // Liquidar masivamente a todos los auxiliares pendientes del mes
  const liquidarTodosPendientes = async () => {
    const pendientes = filasMes.filter(f => !f.liquidado && f.totalCalculado > 0);

    if (pendientes.length === 0) {
      alert("No hay liquidaciones pendientes para el mes seleccionado.");
      return;
    }

    const totalPendiente = pendientes.reduce((sum, f) => sum + f.totalCalculado, 0);

    const confirmar = window.confirm(
      `⚡ ¿Desea liquidar a los ${pendientes.length} auxiliares pendientes del mes ${formatearMesLabel(mesSeleccionado)}?\n\n` +
      `Total a liquidar: $${totalPendiente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}\n\n` +
      `Se generará automáticamente un movimiento contable por cada uno en su respectiva cuenta corriente.`
    );

    if (!confirmar) return;

    setProcesandoAccion(true);
    try {
      const [anio, mes] = mesSeleccionado.split('-');
      const periodoFormateado = `${mes}/${anio}`;
      let nextId = await obtenerProximoIdMov();

      const inserts = pendientes.map(f => {
        const obj = {
          id_mov: nextId,
          id_auxiliar: f.id_auxiliar,
          fecha: fechaTrabajo,
          concepto: 'LIQUIDACION',
          periodo: periodoFormateado,
          debe: f.totalCalculado,
          haber: 0,
          saldo: 0,
          fecha_registro: new Date().toISOString()
        };
        nextId++;
        return obj;
      });

      const { error } = await supabase
        .from('movauxiliares_motor')
        .insert(inserts);

      if (error) throw error;

      mostrarAlerta(`¡Éxito! Se liquidaron ${pendientes.length} auxiliares por un total de $${totalPendiente.toLocaleString('es-AR')}.`, "exito");
      await cargarCierreMensual(mesSeleccionado);
      await cargarAuxiliares();
      if (auxiliarSeleccionado) {
        await cargarMovimientos(auxiliarSeleccionado.id_auxiliar);
      }
    } catch (err) {
      console.error("Error en liquidación masiva:", err);
      alert("Error al liquidar masivamente: " + err.message);
    } finally {
      setProcesandoAccion(false);
    }
  };

  // Anular todas las liquidaciones del mes seleccionado
  const anularTodasLiquidacionesMes = async () => {
    const liquidadas = filasMes.filter(f => f.liquidado);

    if (liquidadas.length === 0) {
      alert("No hay liquidaciones registradas para este mes.");
      return;
    }

    const [anio, mes] = mesSeleccionado.split('-');
    const periodoFormateado = `${mes}/${anio}`;

    const confirmar = window.confirm(
      `⚠️ ATENCIÓN: ¿Está seguro de que desea eliminar TODAS las liquidaciones de ${formatearMesLabel(mesSeleccionado)}?\n\n` +
      `Se anularán los registros contables de ${liquidadas.length} auxiliares y volverán a estado PENDIENTE.`
    );

    if (!confirmar) return;

    setProcesandoAccion(true);
    try {
      const { error } = await supabase
        .from('movauxiliares_motor')
        .delete()
        .eq('periodo', periodoFormateado)
        .eq('concepto', 'LIQUIDACION');

      if (error) throw error;

      mostrarAlerta(`Se anularon todas las liquidaciones del mes ${periodoFormateado}.`, "exito");
      await cargarCierreMensual(mesSeleccionado);
      await cargarAuxiliares();
      if (auxiliarSeleccionado) {
        await cargarMovimientos(auxiliarSeleccionado.id_auxiliar);
      }
    } catch (err) {
      console.error("Error al anular liquidaciones del mes:", err);
      alert("Error al anular liquidaciones: " + err.message);
    } finally {
      setProcesandoAccion(false);
    }
  };

  // =========================================================================
  // LOGICA DE CUENTA CORRIENTE, PAGOS Y AJUSTES
  // =========================================================================
  const abrirFormularioPago = () => {
    setModalAbierto('pago');
    setFechaTx(fechaTrabajo);
    const saldoOdeb = totalDebe - totalHaber;
    setMontoTx(saldoOdeb > 0 ? String(saldoOdeb) : '');
    setConceptoTx('PAGO DE HABERES');
    const [anio, mes] = mesSeleccionado.split('-');
    setPeriodoTx(`${mes}/${anio}`);
  };

  const abrirFormularioAjuste = () => {
    setModalAbierto('ajuste');
    setFechaTx(fechaTrabajo);
    setMontoTx('');
    setConceptoTx('');
    setTipoAjuste('credito');
    const [anio, mes] = mesSeleccionado.split('-');
    setPeriodoTx(`${mes}/${anio}`);
  };

  const guardarPagoOAjuste = async () => {
    const montoNum = parsearDecimal(montoTx);
    if (isNaN(montoNum) || montoNum <= 0) {
      alert("Por favor ingrese un importe válido mayor a 0.");
      return;
    }

    setProcesandoTx(true);
    try {
      let debeInsert = 0;
      let haberInsert = 0;
      let conceptoFinal = (conceptoTx || '').trim().toUpperCase();

      if (modalAbierto === 'pago') {
        haberInsert = montoNum;
        conceptoFinal = conceptoFinal || 'PAGO';
      } else if (modalAbierto === 'ajuste') {
        if (tipoAjuste === 'credito') {
          debeInsert = montoNum; // A favor del auxiliar
          conceptoFinal = `AJUSTE CREDITO: ${conceptoFinal}`;
        } else {
          haberInsert = montoNum; // En contra del auxiliar
          conceptoFinal = `AJUSTE DEBITO: ${conceptoFinal}`;
        }
      }

      const nextId = await obtenerProximoIdMov();

      const nuevoMov = {
        id_mov: nextId,
        id_auxiliar: auxiliarSeleccionado.id_auxiliar,
        fecha: fechaTx,
        concepto: conceptoFinal,
        periodo: periodoTx ? periodoTx.trim() : null,
        debe: debeInsert,
        haber: haberInsert,
        saldo: 0,
        fecha_registro: new Date().toISOString()
      };

      const { error } = await supabase
        .from('movauxiliares_motor')
        .insert([nuevoMov]);

      if (error) throw error;

      mostrarAlerta(modalAbierto === 'pago' ? "Pago registrado con éxito." : "Ajuste contable registrado.", "exito");
      setModalAbierto(null);
      await cargarAuxiliares();
      await cargarMovimientos(auxiliarSeleccionado.id_auxiliar);
    } catch (err) {
      console.error("Error al registrar transacción:", err);
      alert("Error: " + err.message);
    } finally {
      setProcesandoTx(false);
    }
  };

  const eliminarMovimientoIndividual = async (idMov, concepto, periodo) => {
    const confirmar = window.confirm(
      `¿Está seguro de eliminar el movimiento "${concepto}" (${periodo || 'Sin período'})?\n\nEsta acción recalculará automáticamente el saldo de la cuenta corriente.`
    );
    if (!confirmar) return;

    try {
      const { error } = await supabase
        .from('movauxiliares_motor')
        .delete()
        .eq('id_mov', idMov);

      if (error) throw error;

      mostrarAlerta("Movimiento eliminado con éxito.", "exito");
      await cargarAuxiliares();
      if (auxiliarSeleccionado) {
        await cargarMovimientos(auxiliarSeleccionado.id_auxiliar);
      }
      await cargarCierreMensual(mesSeleccionado);
    } catch (err) {
      console.error("Error al eliminar movimiento:", err);
      alert("Error al eliminar movimiento: " + err.message);
    }
  };

  // =========================================================================
  // LOGICA DE DESCUENTOS POR PRESTADOR
  // =========================================================================
  const cargarDescuentosPrestadores = async (periodoYYYYMM) => {
    if (!periodoYYYYMM) return;
    setCargandoDescuentos(true);
    try {
      const [anio, mes] = periodoYYYYMM.split('-');
      const primerDia = `${anio}-${mes}-01`;
      const ultimoDiaVal = new Date(parseInt(anio), parseInt(mes), 0).getDate();
      const ultimoDia = `${anio}-${mes}-${String(ultimoDiaVal).padStart(2, '0')}`;

      const { data: asistencias, error: errAsist } = await supabase
        .from('asistencia_auxiliares_motor')
        .select('*')
        .gte('fecha', primerDia)
        .lte('fecha', ultimoDia);

      if (errAsist) throw errAsist;

      const parsearPrestadoresObs = (obsText) => {
        let pM1 = ''; let sM1 = '1'; let pM2 = ''; let sM2 = '';
        let pT1 = ''; let sT1 = '1'; let pT2 = ''; let sT2 = '';
        const limpiaObs = obsText || '';
        if (limpiaObs) {
          const matchM = limpiaObs.match(/\[P_M:\s*([^\]]+)\]/);
          if (matchM) {
            const parts = matchM[1].split(',').map(p => p.trim());
            if (parts[0]) {
              const [name, share] = parts[0].split('|');
              pM1 = name || ''; sM1 = share || '1';
            }
            if (parts[1]) {
              const [name, share] = parts[1].split('|');
              pM2 = name || ''; sM2 = share || '1';
            }
          }
          const matchT = limpiaObs.match(/\[P_T:\s*([^\]]+)\]/);
          if (matchT) {
            const parts = matchT[1].split(',').map(p => p.trim());
            if (parts[0]) {
              const [name, share] = parts[0].split('|');
              pT1 = name || ''; sT1 = share || '1';
            }
            if (parts[1]) {
              const [name, share] = parts[1].split('|');
              pT2 = name || ''; sT2 = share || '1';
            }
          }
        }
        return {
          prestadorM1: pM1, shareM1: sM1, prestadorM2: pM2, shareM2: sM2,
          prestadorT1: pT1, shareT1: sT1, prestadorT2: pT2, shareT2: sT2
        };
      };

      const calcularMins = (ent, sal) => {
        if (!ent || !sal) return 0;
        const [hEnt, mEnt] = ent.split(':').map(Number);
        const [hSal, mSal] = sal.split(':').map(Number);
        if (isNaN(hEnt) || isNaN(hSal)) return 0;
        return Math.max(0, (hSal * 60 + mSal) - (hEnt * 60 + mEnt));
      };

      const deudas = {};
      const acumularDeuda = (prestador, auxiliarNombre, monto) => {
        const nombreLimpio = (prestador || 'VIVIANA JIMENEZ').trim().toUpperCase();
        if (!deudas[nombreLimpio]) {
          deudas[nombreLimpio] = { total: 0, desglose: {} };
        }
        deudas[nombreLimpio].total += monto;
        if (!deudas[nombreLimpio].desglose[auxiliarNombre]) {
          deudas[nombreLimpio].desglose[auxiliarNombre] = 0;
        }
        deudas[nombreLimpio].desglose[auxiliarNombre] += monto;
      };

      (asistencias || []).forEach(asist => {
        const auxiliarNombre = (asist.nombre || 'AUXILIAR').trim().toUpperCase();
        const tarifa = asist.tipo_liq === 'HORA' ? parsearDecimal(asist.valor_hora) || 0 : parsearDecimal(asist.valor_sesion) || 0;
        const cantidad = asist.tipo_liq === 'HORA' ? parsearDecimal(asist.horas_trabajadas) || 0 : parsearDecimal(asist.sesiones) || 0;
        const costoFila = tarifa * cantidad;

        if (costoFila <= 0) return;

        const parsed = parsearPrestadoresObs(asist.obs);

        if (asist.tipo_liq === 'HORA') {
          const diffM = calcularMins(asist.hora_entrada_m, asist.hora_salida_m);
          const diffT = calcularMins(asist.hora_entrada_t, asist.hora_salida_t);
          const totalDiff = diffM + diffT;

          let costoM = 0;
          let costoT = 0;

          if (totalDiff > 0) {
            costoM = (diffM / totalDiff) * costoFila;
            costoT = (diffT / totalDiff) * costoFila;
          } else {
            if (asist.hora_entrada_m || asist.hora_salida_m) {
              costoM = costoFila;
            } else if (asist.hora_entrada_t || asist.hora_salida_t) {
              costoT = costoFila;
            } else {
              costoM = costoFila;
            }
          }

          if (costoM > 0) {
            if (parsed.prestadorM1) {
              const s1 = parseFloat(parsed.shareM1) || 1;
              const s2 = parseFloat(parsed.shareM2) || 0;
              if (parsed.prestadorM2 && s2 > 0) {
                acumularDeuda(parsed.prestadorM1, auxiliarNombre, costoM * (s1 / (s1 + s2)));
                acumularDeuda(parsed.prestadorM2, auxiliarNombre, costoM * (s2 / (s1 + s2)));
              } else {
                acumularDeuda(parsed.prestadorM1, auxiliarNombre, costoM);
              }
            } else {
              acumularDeuda('VIVIANA JIMENEZ', auxiliarNombre, costoM);
            }
          }

          if (costoT > 0) {
            if (parsed.prestadorT1) {
              const s1 = parseFloat(parsed.shareT1) || 1;
              const s2 = parseFloat(parsed.shareT2) || 0;
              if (parsed.prestadorT2 && s2 > 0) {
                acumularDeuda(parsed.prestadorT1, auxiliarNombre, costoT * (s1 / (s1 + s2)));
                acumularDeuda(parsed.prestadorT2, auxiliarNombre, costoT * (s2 / (s1 + s2)));
              } else {
                acumularDeuda(parsed.prestadorT1, auxiliarNombre, costoT);
              }
            } else {
              acumularDeuda('VIVIANA JIMENEZ', auxiliarNombre, costoT);
            }
          }
        } else {
          // SESION
          if (parsed.prestadorM1) {
            const s1 = parseFloat(parsed.shareM1) || 1;
            const s2 = parseFloat(parsed.shareM2) || 0;
            if (parsed.prestadorM2 && s2 > 0) {
              acumularDeuda(parsed.prestadorM1, auxiliarNombre, costoFila * (s1 / (s1 + s2)));
              acumularDeuda(parsed.prestadorM2, auxiliarNombre, costoFila * (s2 / (s1 + s2)));
            } else {
              acumularDeuda(parsed.prestadorM1, auxiliarNombre, costoFila);
            }
          } else {
            acumularDeuda('VIVIANA JIMENEZ', auxiliarNombre, costoFila);
          }
        }
      });

      const descuentosList = Object.keys(deudas).map(name => ({
        nombre: name,
        total: deudas[name].total,
        desglose: deudas[name].desglose
      })).sort((a, b) => b.total - a.total);

      setDescuentosPrestadores(descuentosList);
    } catch (err) {
      console.error("Error al calcular descuentos:", err);
    } finally {
      setCargandoDescuentos(false);
    }
  };

  // Métricas de Cierre Mensual
  const totalMesCalculado = filasMes.reduce((acc, f) => acc + f.totalCalculado, 0);
  const totalMesLiquidado = filasMes.filter(f => f.liquidado).reduce((acc, f) => acc + f.totalCalculado, 0);
  const totalMesPendiente = filasMes.filter(f => !f.liquidado).reduce((acc, f) => acc + f.totalCalculado, 0);

  // Totales de Cuenta Corriente del auxiliar seleccionado
  const totalDebe = movimientos.reduce((acc, m) => acc + (parsearDecimal(m.debe) || 0), 0);
  const totalHaber = movimientos.reduce((acc, m) => acc + (parsearDecimal(m.haber) || 0), 0);
  const saldoFinal = totalDebe - totalHaber;

  return (
    <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', fontFamily: 'Segoe UI, system-ui, sans-serif', color: '#1e293b' }}>
      
      {/* Cabecera Principal */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '18px', marginBottom: '20px' }}>
        <div>
          <h2 style={{ color: '#0f172a', margin: 0, fontSize: '22px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
            💰 Planilla de Liquidación de Auxiliares
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            Cierre mensual de haberes, cuentas corrientes individuales y cálculo de descuentos por prestador.
          </p>
        </div>
        <button
          onClick={onVolver}
          style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569', transition: 'all 0.2s' }}
          onMouseOver={(e) => e.target.style.background = '#e2e8f0'}
          onMouseOut={(e) => e.target.style.background = '#f1f5f9'}
        >
          ← Volver al Menú
        </button>
      </div>

      {/* Selector de Pestañas de Navegación */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '2px solid #e2e8f0', marginBottom: '25px' }}>
        <button
          onClick={() => setSubVista('cierre_mensual')}
          style={{
            padding: '12px 20px',
            border: 'none',
            borderBottom: subVista === 'cierre_mensual' ? '3px solid #2563eb' : '3px solid transparent',
            background: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: subVista === 'cierre_mensual' ? 'bold' : '600',
            color: subVista === 'cierre_mensual' ? '#2563eb' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '-2px',
            transition: 'all 0.2s'
          }}
        >
          📅 Cierre y Liquidación Mensual
        </button>

        <button
          onClick={() => setSubVista('cuenta_corriente')}
          style={{
            padding: '12px 20px',
            border: 'none',
            borderBottom: subVista === 'cuenta_corriente' ? '3px solid #2563eb' : '3px solid transparent',
            background: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: subVista === 'cuenta_corriente' ? 'bold' : '600',
            color: subVista === 'cuenta_corriente' ? '#2563eb' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '-2px',
            transition: 'all 0.2s'
          }}
        >
          👤 Cuenta Corriente y Pagos
        </button>

        <button
          onClick={() => setSubVista('descuentos')}
          style={{
            padding: '12px 20px',
            border: 'none',
            borderBottom: subVista === 'descuentos' ? '3px solid #2563eb' : '3px solid transparent',
            background: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: subVista === 'descuentos' ? 'bold' : '600',
            color: subVista === 'descuentos' ? '#2563eb' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '-2px',
            transition: 'all 0.2s'
          }}
        >
          📋 Descuentos por Prestador
        </button>
      </div>

      {/* Alerta flotante de mensajes */}
      {mensaje.texto && (
        <div style={{
          padding: '12px 20px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '14px',
          fontWeight: '500',
          backgroundColor: mensaje.tipo === 'exito' ? '#dcfce7' : '#fee2e2',
          color: mensaje.tipo === 'exito' ? '#15803d' : '#b91c1c',
          border: `1px solid ${mensaje.tipo === 'exito' ? '#bbf7d0' : '#fecaca'}`
        }}>
          {mensaje.texto}
        </div>
      )}

      {/* ================================================================= */}
      {/* VISTA 1: CIERRE Y LIQUIDACIÓN MENSUAL */}
      {/* ================================================================= */}
      {subVista === 'cierre_mensual' && (
        <div>
          {/* Barra superior de selección de mes y acciones masivas */}
          <div style={{ background: '#f8fafc', padding: '18px 22px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#334155' }}>Seleccionar Período:</span>
              <select
                value={mesSeleccionado}
                onChange={(e) => setMesSeleccionado(e.target.value)}
                style={{ padding: '8px 16px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', fontWeight: 'bold', background: '#fff', color: '#0f172a', cursor: 'pointer' }}
              >
                {periodosDisponibles.map(p => (
                  <option key={p} value={p}>{formatearMesLabel(p)} ({p})</option>
                ))}
              </select>
              <button
                onClick={() => cargarCierreMensual(mesSeleccionado)}
                disabled={cargandoMes}
                title="Actualizar datos del mes"
                style={{ padding: '8px 14px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                {cargandoMes ? 'Cargando...' : '🔄 Actualizar'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={liquidarTodosPendientes}
                disabled={procesandoAccion || cargandoMes || totalMesPendiente <= 0}
                style={{
                  background: totalMesPendiente > 0 ? '#10b981' : '#cbd5e1',
                  color: '#fff',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  cursor: totalMesPendiente > 0 ? 'pointer' : 'not-allowed',
                  fontSize: '13.5px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: totalMesPendiente > 0 ? '0 2px 4px rgba(16,185,129,0.2)' : 'none'
                }}
              >
                ⚡ Liquidar Todos los Pendientes ({filasMes.filter(f => !f.liquidado).length})
              </button>

              <button
                onClick={anularTodasLiquidacionesMes}
                disabled={procesandoAccion || cargandoMes || totalMesLiquidado <= 0}
                style={{
                  background: totalMesLiquidado > 0 ? '#ef4444' : '#f1f5f9',
                  color: totalMesLiquidado > 0 ? '#fff' : '#94a3b8',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  cursor: totalMesLiquidado > 0 ? 'pointer' : 'not-allowed',
                  fontSize: '13.5px',
                  fontWeight: '600'
                }}
              >
                🗑️ Anular Todo el Mes
              </button>
            </div>
          </div>

          {/* Tarjetas de Métricas del Mes */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '25px' }}>
            <div style={{ background: '#eff6ff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e40af', textTransform: 'uppercase' }}>
                Total Devengado del Mes
              </span>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#1e3a8a', marginTop: '4px' }}>
                ${totalMesCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '11px', color: '#3b82f6' }}>
                {filasMes.length} auxiliares con asistencias
              </span>
            </div>

            <div style={{ background: '#f0fdf4', padding: '16px 20px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#166534', textTransform: 'uppercase' }}>
                Total Ya Liquidado
              </span>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#15803d', marginTop: '4px' }}>
                ${totalMesLiquidado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '11px', color: '#16a34a' }}>
                {filasMes.filter(f => f.liquidado).length} de {filasMes.length} liquidados
              </span>
            </div>

            <div style={{ background: totalMesPendiente > 0 ? '#fffbeb' : '#f8fafc', padding: '16px 20px', borderRadius: '12px', border: totalMesPendiente > 0 ? '1px solid #fde68a' : '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: totalMesPendiente > 0 ? '#92400e' : '#64748b', textTransform: 'uppercase' }}>
                Total Pendiente
              </span>
              <div style={{ fontSize: '22px', fontWeight: '800', color: totalMesPendiente > 0 ? '#b45309' : '#64748b', marginTop: '4px' }}>
                ${totalMesPendiente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '11px', color: totalMesPendiente > 0 ? '#d97706' : '#94a3b8' }}>
                {filasMes.filter(f => !f.liquidado).length} auxiliares por liquidar
              </span>
            </div>

            <div style={{ background: '#f8fafc', padding: '16px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>
                Estado General
              </span>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: totalMesPendiente === 0 && filasMes.length > 0 ? '#15803d' : '#0f172a', marginTop: '8px' }}>
                {filasMes.length === 0 ? 'Sin Asistencias' : totalMesPendiente === 0 ? '✅ Mes 100% Liquidado' : '🟡 Liquidación en Curso'}
              </div>
              <span style={{ fontSize: '11px', color: '#64748b' }}>
                Período: {formatearMesLabel(mesSeleccionado)}
              </span>
            </div>
          </div>

          {/* Tabla de Auxiliares del Mes */}
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>
                📋 Auxiliares con Asistencias en {formatearMesLabel(mesSeleccionado)}
              </h3>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                Hacé clic en <b>"👁️ Ver Días"</b> para verificar los días y horarios trabajados antes de confirmar.
              </span>
            </div>

            {cargandoMes ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                Cargando datos del período {formatearMesLabel(mesSeleccionado)}...
              </div>
            ) : filasMes.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                No se registraron jornadas de asistencia para los auxiliares en {formatearMesLabel(mesSeleccionado)}.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#475569' }}>
                      <th style={{ padding: '12px 14px' }}>Auxiliar</th>
                      <th style={{ padding: '12px 14px' }}>Modalidad</th>
                      <th style={{ padding: '12px 14px' }}>Jornadas / Asistencias</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}>Tarifa Unit.</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}>Total del Mes</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center' }}>Estado</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filasMes.map(fila => (
                      <tr key={fila.id_auxiliar} style={{ borderBottom: '1px solid #e2e8f0', background: fila.liquidado ? '#f0fdf4' : '#fff' }}>
                        <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#0f172a' }}>
                          👤 {fila.nombre}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '4px', background: fila.tipo_liq === 'HORA' ? '#e0f2fe' : '#fef3c7', color: fila.tipo_liq === 'HORA' ? '#0369a1' : '#b45309' }}>
                            {fila.tipo_liq}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', color: '#334155' }}>
                          {fila.dias} días trabajados • {fila.tipo_liq === 'HORA' ? `${fila.totalHoras.toFixed(2)} hs` : `${fila.totalSesiones} sesiones`}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', color: '#64748b' }}>
                          ${fila.tarifa ? fila.tarifa.toLocaleString('es-AR') : 0}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 'bold', fontSize: '14.5px', color: '#0f172a' }}>
                          ${fila.totalCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          {fila.liquidado ? (
                            <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '4px 10px', borderRadius: '12px', fontSize: '11.5px', fontWeight: 'bold' }}>
                              ✅ LIQUIDADO
                            </span>
                          ) : (
                            <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '4px 10px', borderRadius: '12px', fontSize: '11.5px', fontWeight: 'bold' }}>
                              🟡 PENDIENTE
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                            <button
                              onClick={() => setModalDetalleDias({ auxiliar: fila, asistencias: fila.asistencias })}
                              style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                              title="Ver desglose día por día"
                            >
                              👁️ Ver Días
                            </button>

                            {fila.liquidado ? (
                              <button
                                onClick={() => anularLiquidacion(fila)}
                                disabled={procesandoAccion}
                                style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                                title="Anular liquidación de este auxiliar"
                              >
                                ❌ Anular
                              </button>
                            ) : (
                              <button
                                onClick={() => liquidarAuxiliar(fila)}
                                disabled={procesandoAccion}
                                style={{ background: '#10b981', border: 'none', color: '#fff', padding: '5px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                                title="Confirmar liquidación en cuenta corriente"
                              >
                                ⚡ Liquidar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* VISTA 2: CUENTA CORRIENTE Y PAGOS */}
      {/* ================================================================= */}
      {subVista === 'cuenta_corriente' && (
        <div>
          {/* Selector de Auxiliar */}
          <div style={{ marginBottom: '25px', background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>
              Seleccione un Auxiliar para ver su Cuenta Corriente e imputar Pagos:
            </label>
            {cargandoAuxiliares ? (
              <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>Cargando auxiliares...</p>
            ) : (
              <select
                value={auxiliarSeleccionado?.id_auxiliar || ''}
                onChange={(e) => {
                  const p = auxiliares.find(x => String(x.id_auxiliar) === String(e.target.value));
                  setAuxiliarSeleccionado(p || null);
                }}
                style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', background: '#fff', fontWeight: '600', color: '#0f172a' }}
              >
                <option value="">-- Seleccionar Auxiliar --</option>
                {auxiliares.map(p => (
                  <option key={p.id_auxiliar} value={p.id_auxiliar}>
                    👤 {p.nombre} ({p.tipo_liq}) - Saldo Pendiente: ${p.saldoConsolidado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </option>
                ))}
              </select>
            )}
          </div>

          {auxiliarSeleccionado && (
            <div>
              {/* Tarjetas de Saldo Individual */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '25px' }}>
                <div style={{ padding: '20px', borderRadius: '12px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', border: '1px solid #bfdbfe' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e40af', textTransform: 'uppercase' }}>
                    Saldo Pendiente a Pagar
                  </span>
                  <div style={{ fontSize: '26px', fontWeight: '800', color: saldoFinal > 0 ? '#b91c1c' : '#15803d', marginTop: '6px' }}>
                    ${saldoFinal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: '11px', color: '#3b82f6', marginTop: '4px', display: 'block' }}>
                    {saldoFinal > 0 ? 'Deuda pendiente a favor del auxiliar' : saldoFinal === 0 ? 'Cuenta al día (Saldo $0)' : 'Saldo a favor del consultorio'}
                  </span>
                </div>

                <div style={{ padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
                    Total Devengado (Debe)
                  </span>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a', marginTop: '6px' }}>
                    ${totalDebe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                    Liquidaciones mensuales acumuladas + Créditos
                  </span>
                </div>

                <div style={{ padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
                    Total Pagado (Haber)
                  </span>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#0f172a', marginTop: '6px' }}>
                    ${totalHaber.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
                    Pagos abonados y transferencias + Débitos
                  </span>
                </div>
              </div>

              {/* Botones de Transacción */}
              <div style={{ display: 'flex', gap: '15px', marginBottom: '25px' }}>
                <button
                  onClick={abrirFormularioPago}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#10b981',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  💵 Registrar Pago (al Haber)
                </button>

                <button
                  onClick={abrirFormularioAjuste}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#f59e0b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  ⚙️ Registrar Ajuste Manual (Crédito/Débito)
                </button>
              </div>

              {/* Modal de Transacción Inline (Pagos y Ajustes) */}
              {modalAbierto && (
                <div style={{ background: '#f8fafc', padding: '22px', borderRadius: '12px', border: '1px solid #cbd5e1', marginBottom: '25px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '10px', marginBottom: '15px' }}>
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>
                      {modalAbierto === 'pago' ? '💵 Registrar Pago a Auxiliar' : '⚙️ Registrar Ajuste Contable'}
                    </h4>
                    <button onClick={() => setModalAbierto(null)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Importe ($) *</label>
                      <input
                        type="number"
                        value={montoTx}
                        onChange={(e) => setMontoTx(e.target.value)}
                        placeholder="Ej: 50000"
                        style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Fecha de Pago *</label>
                      <input
                        type="date"
                        value={fechaTx}
                        onChange={(e) => setFechaTx(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                      />
                    </div>
                  </div>

                  {modalAbierto === 'ajuste' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Tipo de Ajuste *</label>
                        <select
                          value={tipoAjuste}
                          onChange={(e) => setTipoAjuste(e.target.value)}
                          style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', background: '#fff' }}
                        >
                          <option value="credito">Crédito (A favor del Auxiliar - Suma al Debe)</option>
                          <option value="debito">Débito (En contra del Auxiliar - Suma al Haber)</option>
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px' }}>Período Imputado (Opcional)</label>
                        <input
                          type="text"
                          value={periodoTx}
                          onChange={(e) => setPeriodoTx(e.target.value)}
                          placeholder="Ej: 08/2026"
                          style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                        />
                      </div>
                    </div>
                  )}

                  {modalAbierto === 'pago' && (
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px' }}>Período Imputado (Ej: 08/2026)</label>
                      <input
                        type="text"
                        value={periodoTx}
                        onChange={(e) => setPeriodoTx(e.target.value)}
                        placeholder="Ej: 08/2026"
                        style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                      />
                    </div>
                  )}

                  <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Concepto / Detalle *</label>
                    <input
                      type="text"
                      value={conceptoTx}
                      onChange={(e) => setConceptoTx(e.target.value)}
                      placeholder="Ej: Transferencia bancaria haberes de agosto"
                      style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      onClick={() => setModalAbierto(null)}
                      disabled={procesandoTx}
                      style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={guardarPagoOAjuste}
                      disabled={procesandoTx}
                      style={{
                        padding: '8px 20px',
                        background: modalAbierto === 'pago' ? '#10b981' : '#f59e0b',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold'
                      }}
                    >
                      {procesandoTx ? 'Procesando...' : 'Confirmar Registro'}
                    </button>
                  </div>
                </div>
              )}

              {/* Extracto Contable */}
              <div>
                <h3 style={{ fontSize: '16px', color: '#0f172a', fontWeight: 'bold', margin: '0 0 15px 0' }}>
                  📋 Historial de Cuenta Corriente (Extracto)
                </h3>
                {cargandoMovimientos ? (
                  <p style={{ fontSize: '14px', color: '#64748b' }}>Cargando extracto...</p>
                ) : movimientos.length === 0 ? (
                  <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                    Este auxiliar no registra movimientos contables en su cuenta corriente.
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                          <th style={{ padding: '12px 10px' }}>Fecha</th>
                          <th style={{ padding: '12px 10px' }}>Concepto</th>
                          <th style={{ padding: '12px 10px', textAlign: 'center' }}>Período</th>
                          <th style={{ padding: '12px 10px', textAlign: 'right' }}>Debe (+) (Devengado)</th>
                          <th style={{ padding: '12px 10px', textAlign: 'right' }}>Haber (-) (Pagado)</th>
                          <th style={{ padding: '12px 10px', textAlign: 'right' }}>Saldo Acumulado</th>
                          <th style={{ padding: '12px 10px', textAlign: 'center' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movimientos.map((m, idx) => {
                          const valDebe = parsearDecimal(m.debe) || 0;
                          const valHaber = parsearDecimal(m.haber) || 0;
                          return (
                            <tr key={m.id_mov || idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '10px', whiteSpace: 'nowrap', color: '#475569' }}>
                                {m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/F'}
                              </td>
                              <td style={{ padding: '10px', color: '#1e293b', fontWeight: 'bold' }}>
                                {m.concepto || 'S/D'}
                              </td>
                              <td style={{ padding: '10px', textAlign: 'center', color: '#64748b' }}>
                                <span style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                                  {m.periodo || '-'}
                                </span>
                              </td>
                              <td style={{ padding: '10px', textAlign: 'right', color: valDebe > 0 ? '#15803d' : '#94a3b8', fontWeight: '600' }}>
                                {valDebe > 0 ? `$${valDebe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                              </td>
                              <td style={{ padding: '10px', textAlign: 'right', color: valHaber > 0 ? '#b91c1c' : '#94a3b8', fontWeight: '600' }}>
                                {valHaber > 0 ? `$${valHaber.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                              </td>
                              <td style={{ padding: '10px', textAlign: 'right', color: m.saldoAcumulado > 0 ? '#b91c1c' : '#15803d', fontWeight: 'bold' }}>
                                ${m.saldoAcumulado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </td>
                              <td style={{ padding: '10px', textAlign: 'center' }}>
                                <button
                                  onClick={() => eliminarMovimientoIndividual(m.id_mov, m.concepto, m.periodo)}
                                  title="Eliminar este movimiento"
                                  style={{ background: '#fee2e2', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px' }}
                                >
                                  🗑️
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
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* VISTA 3: DESCUENTOS POR PRESTADOR */}
      {/* ================================================================= */}
      {subVista === 'descuentos' && (
        <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <div>
              <h3 style={{ margin: 0, color: '#0f172a', fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                📋 Descuentos por Prestador (Costo de Auxiliares)
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                Monto que corresponde descontar a cada profesional según las asistencias registradas en el mes.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569' }}>Mes:</span>
              <select
                value={mesSeleccionado}
                onChange={(e) => setMesSeleccionado(e.target.value)}
                style={{ padding: '6px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13.5px', background: '#fff', fontWeight: 'bold', color: '#0f172a' }}
              >
                {periodosDisponibles.map(p => (
                  <option key={p} value={p}>{formatearMesLabel(p)}</option>
                ))}
              </select>
            </div>
          </div>

          {cargandoDescuentos ? (
            <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>Calculando distribución de costos por prestador...</p>
          ) : descuentosPrestadores.length === 0 ? (
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
              No se registran asistencias ni prestadores asignados para el período seleccionado.
            </p>
          ) : (
            <div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #cbd5e1' }}>
                      <th style={{ padding: '10px', color: '#475569', fontWeight: '600' }}>Prestador</th>
                      <th style={{ padding: '10px', color: '#475569', fontWeight: '600' }}>Desglose por Auxiliar</th>
                      <th style={{ padding: '10px', color: '#475569', fontWeight: '600', textAlign: 'right' }}>Total a Descontar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {descuentosPrestadores.map(row => (
                      <tr key={row.nombre} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#1e293b' }}>👤 {row.nombre}</td>
                        <td style={{ padding: '12px 10px', color: '#64748b', fontSize: '12.5px' }}>
                          {Object.keys(row.desglose).map(aux => (
                            <span key={aux} style={{ display: 'inline-block', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', marginRight: '6px', marginBottom: '3px' }}>
                              {aux}: ${row.desglose[aux].toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </span>
                          ))}
                        </td>
                        <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#b91c1c', textAlign: 'right', fontSize: '14.5px' }}>
                          -${row.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 'bold' }}>
                      <td colSpan="2" style={{ padding: '14px 10px', color: '#0f172a' }}>TOTAL GENERAL A DESCONTAR</td>
                      <td style={{ padding: '14px 10px', color: '#b91c1c', fontSize: '16px', fontWeight: '800', textAlign: 'right' }}>
                        -${descuentosPrestadores.reduce((sum, r) => sum + r.total, 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p style={{ margin: '12px 0 0 0', fontSize: '11px', color: '#64748b', fontStyle: 'italic' }}>
                💡 Nota: Los días trabajados que no tengan prestador explícito se asignan de forma predeterminada a <b>VIVIANA JIMENEZ</b>.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL DESPLEGABLE: VER DETALLE DE DÍAS TRABAJADOS */}
      {/* ================================================================= */}
      {modalDetalleDias && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 99999
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            width: '90%',
            maxWidth: '850px',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 'bold', color: '#0f172a' }}>
                  📅 Detalle de Asistencias - {modalDetalleDias.auxiliar.nombre}
                </h3>
                <span style={{ fontSize: '13px', color: '#64748b' }}>
                  Período: {formatearMesLabel(mesSeleccionado)} • Modalidad: {modalDetalleDias.auxiliar.tipo_liq}
                </span>
              </div>
              <button
                onClick={() => setModalDetalleDias(null)}
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #cbd5e1', color: '#475569' }}>
                    <th style={{ padding: '10px' }}>Fecha</th>
                    <th style={{ padding: '10px' }}>Turno Mañana</th>
                    <th style={{ padding: '10px' }}>Turno Tarde</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Cantidad</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Tarifa</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {modalDetalleDias.asistencias.map((asist, idx) => {
                    const tarifa = asist.tipo_liq === 'HORA' ? parsearDecimal(asist.valor_hora) || 0 : parsearDecimal(asist.valor_sesion) || 0;
                    const cantidad = asist.tipo_liq === 'HORA' ? parsearDecimal(asist.horas_trabajadas) || 0 : parsearDecimal(asist.sesiones) || 0;
                    const subtotal = tarifa * cantidad;

                    return (
                      <tr key={asist.id_registro || idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1e293b', whiteSpace: 'nowrap' }}>
                          {asist.fecha ? new Date(asist.fecha + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '-'}
                        </td>
                        <td style={{ padding: '10px', color: '#64748b' }}>
                          {asist.hora_entrada_m ? `${asist.hora_entrada_m.slice(0, 5)} a ${asist.hora_salida_m?.slice(0, 5) || ''}` : '-'}
                        </td>
                        <td style={{ padding: '10px', color: '#64748b' }}>
                          {asist.hora_entrada_t ? `${asist.hora_entrada_t.slice(0, 5)} a ${asist.hora_salida_t?.slice(0, 5) || ''}` : '-'}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold' }}>
                          {cantidad} {asist.tipo_liq === 'HORA' ? 'hs' : 'ses'}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', color: '#64748b' }}>
                          ${tarifa.toLocaleString('es-AR')}
                        </td>
                        <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#0f172a' }}>
                          ${subtotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Total acumulado del mes: </span>
                <strong style={{ fontSize: '16px', color: '#15803d' }}>
                  ${modalDetalleDias.auxiliar.totalCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </strong>
              </div>
              <button
                onClick={() => setModalDetalleDias(null)}
                style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
              >
                Cerrar Detalle
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
