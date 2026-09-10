import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function FichaPrestadores({ onVolver, usuario, userEmail }) {
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

  const [prestadores, setPrestadores] = useState([]);
  const [prestadorSeleccionado, setPrestadorSeleccionado] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [filtroConcepto, setFiltroConcepto] = useState('');
  const [cargandoPrestadores, setCargandoPrestadores] = useState(false);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);

  // Estados para modales/formularios de transacción
  const [modalAbierto, setModalAbierto] = useState(null); // 'pago', 'gasto', 'ajuste'
  const [fechaTx, setFechaTx] = useState('');
  const [montoTx, setMontoTx] = useState('');
  const [conceptoTx, setConceptoTx] = useState('');
  const [observacionTx, setObservacionTx] = useState('');
  const [tipoAjuste, setTipoAjuste] = useState('credito'); // 'credito' (haber) o 'debito' (debe)
  const [procesandoTx, setProcesandoTx] = useState(false);

  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // --- PROYECCIÓN DE INGRESOS POR PACIENTE (ACUERDOS MENSUALES) ---
  const [modalProyeccionAbierto, setModalProyeccionAbierto] = useState(false);
  const [periodoProyeccion, setPeriodoProyeccion] = useState(202609);
  const [filtroPacienteProyeccion, setFiltroPacienteProyeccion] = useState('');
  const [cargandoProyeccion, setCargandoProyeccion] = useState(false);
  const [datosProyeccion, setDatosProyeccion] = useState([]);

  // --- BÚSQUEDA Y SUMARIZACIÓN GLOBAL ---
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [globalResults, setGlobalResults] = useState([]);
  const [cargandoGlobal, setCargandoGlobal] = useState(false);

  const ejecutarBusquedaGlobal = async () => {
    if (!globalSearchTerm.trim()) {
      alert("Por favor ingrese un concepto o referencia para buscar.");
      return;
    }
    setCargandoGlobal(true);
    try {
      const term = `%${globalSearchTerm.trim()}%`;
      const { data, error } = await supabase
        .from('movprestadores_motor')
        .select('*')
        .or(`concepto.ilike.${term},acuerdo.ilike.${term}`)
        .order('fecha', { ascending: false })
        .order('id_mov', { ascending: false });

      if (error) throw error;

      const revertedPagoIds = new Set();
      (data || []).forEach(m => {
        const concepto = (m.concepto || '').toUpperCase();
        if (concepto.startsWith('REVERSO') && m.id_pago) {
          revertedPagoIds.add(m.id_pago);
        }
      });
      const filtered = (data || []).filter(m => !m.id_pago || !revertedPagoIds.has(m.id_pago));

      setGlobalResults(filtered);
    } catch (err) {
      console.error("Error en búsqueda global:", err);
      alert("Error al buscar: " + err.message);
    } finally {
      setCargandoGlobal(false);
    }
  };

  const getNombrePrestador = (id) => {
    const p = prestadores.find(x => String(x.id_prestador) === String(id));
    return p ? p.nombre_prestador : `Prestador #${id}`;
  };

  // --- REPORTE DE INGRESOS MENSUALES CONFIDENCIAL ---
  const [modalReporteAbierto, setModalReporteAbierto] = useState(false);
  const [cargandoReporte, setCargandoReporte] = useState(false);
  const [datosReporte, setDatosReporte] = useState([]);

  const ALLOWED_EMAILS = ['marcodominguez@crin.app', 'vivianajimenez@crin.app'];
  const tieneAccesoReporte = ALLOWED_EMAILS.includes(String(userEmail || '').trim().toLowerCase());

  const cargarReporteIngresos = async () => {
    setCargandoReporte(true);
    try {
      const { data: prestadores, error: errorP } = await supabase
        .from('prestadores_motor')
        .select('id_prestador, nombre_prestador')
        .order('nombre_prestador', { ascending: true });

      if (errorP) throw errorP;

      let listaMovs = [];
      let from = 0;
      let to = 999;
      let keepFetching = true;
      
      while (keepFetching) {
        const { data, error } = await supabase
          .from('movprestadores_motor')
          .select('id_prestador, debe, haber, id_pago, concepto, fecha')
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

      const revertedPagoIds = new Set();
      listaMovs.forEach(m => {
        const concepto = (m.concepto || '').toUpperCase();
        if (concepto.startsWith('REVERSO') && m.id_pago) {
          revertedPagoIds.add(m.id_pago);
        }
      });
      const movimientosFiltrados = listaMovs.filter(m => !m.id_pago || !revertedPagoIds.has(m.id_pago));

      const prestadorMesMapa = {};
      movimientosFiltrados.forEach(m => {
        if (!m.fecha) return;
        if (m.fecha < '2026-03-01') return; // Descartar enero y febrero
        const mes = m.fecha.substring(0, 7);
        const id = m.id_prestador;

        const conc = (m.concepto || '').toUpperCase();
        const esPago = conc.includes('PAGO') || conc.includes('RETIRO') || conc.includes('ENTREGA');

        if (!esPago) {
          const debeVal = parsearDecimal(m.debe);
          const haberVal = parsearDecimal(m.haber);
          const neto = haberVal - debeVal;

          if (!prestadorMesMapa[id]) {
            prestadorMesMapa[id] = {};
          }
          if (!prestadorMesMapa[id][mes]) {
            prestadorMesMapa[id][mes] = 0;
          }
          prestadorMesMapa[id][mes] += neto;
        }
      });

      const listadoFinal = prestadores.map(p => {
        const meses = prestadorMesMapa[p.id_prestador] || {};
        const listaMesesValidos = Object.keys(meses).sort();
        
        let suma = 0;
        let cantMeses = 0;
        const desglose = listaMesesValidos.map(m => {
          const val = meses[m];
          if (Math.abs(val) > 0.01) {
            suma += val;
            cantMeses++;
          }
          return { mes: m, monto: val };
        });

        const promedio = cantMeses > 0 ? suma / cantMeses : 0;

        return {
          id_prestador: p.id_prestador,
          nombre_prestador: p.nombre_prestador,
          promedio,
          desglose
        };
      }).filter(p => p.promedio > 0 || p.desglose.length > 0)
        .sort((a, b) => b.promedio - a.promedio);

      setDatosReporte(listadoFinal);
    } catch (err) {
      console.error("Error al cargar reporte de ingresos prestadores:", err);
      alert("Error al cargar el reporte: " + err.message);
    } finally {
      setCargandoReporte(false);
    }
  };

  const descargarReporteIngresosExcel = () => {
    const BOM = "\uFEFF";
    let csv = "sep=;\n";
    csv += `Reporte Confidencial - Promedio Mensual de Ingresos por Prestador\n\n`;
    csv += "Prestador;Promedio Mensual ($);Meses y Montos Detallados\r\n";

    datosReporte.forEach(p => {
      const promedioStr = p.promedio.toFixed(2).replace('.', ',');
      const desgloseStr = p.desglose
        .map(d => `${d.mes}: $${d.monto.toFixed(2)}`)
        .join(" | ");
      csv += `${p.nombre_prestador};${promedioStr};${desgloseStr}\r\n`;
    });

    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Promedios_Mensuales_Prestadores.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    cargarPrestadores();
  }, []);

  useEffect(() => {
    if (prestadorSeleccionado) {
      cargarMovimientos(prestadorSeleccionado.id_prestador);
    }
  }, [prestadorSeleccionado]);

  // Carga inicial de prestadores y cálculo de saldos consolidados
  const cargarPrestadores = async () => {
    setCargandoPrestadores(true);
    try {
      // Obtener todos los prestadores
      const { data: listaP, error: errorP } = await supabase
        .from('prestadores_motor')
        .select('*')
        .order('nombre_prestador', { ascending: true });

      if (errorP) throw errorP;

      // Obtener todos los movimientos consolidados para calcular saldos (paginado para superar límite de 1000)
      let listaMovs = [];
      let from = 0;
      let to = 999;
      let keepFetching = true;
      
      while (keepFetching) {
        const { data, error } = await supabase
          .from('movprestadores_motor')
          .select('id_prestador, debe, haber, id_pago, concepto')
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

      // Filtrar movimientos pertenecientes a pagos que fueron revertidos
      const revertedPagoIds = new Set();
      listaMovs.forEach(m => {
        const concepto = (m.concepto || '').toUpperCase();
        if (concepto.startsWith('REVERSO') && m.id_pago) {
          revertedPagoIds.add(m.id_pago);
        }
      });
      const movimientosFiltrados = listaMovs.filter(m => !m.id_pago || !revertedPagoIds.has(m.id_pago));

      // Mapear saldos
      const saldosMapa = {};
      movimientosFiltrados.forEach(m => {
        const id = m.id_prestador;
        const debeVal = parsearDecimal(m.debe);
        const haberVal = parsearDecimal(m.haber);
        if (!saldosMapa[id]) {
          saldosMapa[id] = 0;
        }
        saldosMapa[id] += (haberVal - debeVal);
      });

      const prestadoresConSaldos = (listaP || []).map(p => {
        let saldoVal = saldosMapa[p.id_prestador] || 0;
        if (Math.abs(saldoVal) < 100) {
          saldoVal = 0;
        }
        return {
          ...p,
          saldoConsolidado: saldoVal
        };
      });

      setPrestadores(prestadoresConSaldos);

      // Si había uno seleccionado, actualizar su saldo de referencia
      if (prestadorSeleccionado) {
        const actualizado = prestadoresConSaldos.find(p => p.id_prestador === prestadorSeleccionado.id_prestador);
        if (actualizado) setPrestadorSeleccionado(actualizado);
      }
    } catch (error) {
      console.error("Error al cargar prestadores:", error);
      mostrarAlerta("Error al cargar listado de profesionales: " + error.message, "error");
    } finally {
      setCargandoPrestadores(false);
    }
  };

  // Cargar movimientos detallados del prestador seleccionado
  const cargarMovimientos = async (idPrestador) => {
    setCargandoMovimientos(true);
    try {
      const { data, error } = await supabase
        .from('movprestadores_motor')
        .select('*')
        .eq('id_prestador', idPrestador)
        .order('fecha', { ascending: true })
        .order('id_mov', { ascending: true });

      if (error) throw error;

      const revertedPagoIds = new Set();
      (data || []).forEach(m => {
        const concepto = (m.concepto || '').toUpperCase();
        if (concepto.startsWith('REVERSO') && m.id_pago) {
          revertedPagoIds.add(m.id_pago);
        }
      });

      const filtered = (data || []).filter(m => !m.id_pago || !revertedPagoIds.has(m.id_pago));

      // Calcular saldo acumulado cronológicamente
      let saldoAcumulado = 0;
      const movimientosConSaldo = filtered.map(m => {
        const debe = parsearDecimal(m.debe);
        const haber = parsearDecimal(m.haber);
        saldoAcumulado += (haber - debe);
        return {
          ...m,
          saldoAcumulado: saldoAcumulado
        };
      });

      // Mostramos los más recientes primero en la tabla
      setMovimientos(movimientosConSaldo.reverse());
    } catch (error) {
      console.error("Error al cargar movimientos:", error);
      mostrarAlerta("Error al cargar la cuenta corriente.", "error");
    } finally {
      setCargandoMovimientos(false);
    }
  };

  const manejarDescargaExcel = (movs, nombrePrestador) => {
    // Usamos directamente los movimientos tal como se muestran en pantalla (orden descendiente: lo más nuevo arriba)
    const BOM = "\uFEFF";
    let csv = "sep=;\n";
    csv += `Historial Completo - Profesional: ${nombrePrestador}\n\n`;
    csv += "Fecha;Concepto;Acuerdo;Debe ($);Haber ($);Saldo Acumulado ($)\r\n";

    movs.forEach(m => {
      const valDebe = parsearDecimal(m.debe);
      const valHaber = parsearDecimal(m.haber);

      const fecha = m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/D';
      const concepto = (m.concepto || '').replace(/;/g, ',');
      const acuerdo = (m.acuerdo || '-').replace(/;/g, ',');
      const debeStr = valDebe > 0 ? valDebe.toFixed(2).replace('.', ',') : '';
      const haberStr = valHaber > 0 ? valHaber.toFixed(2).replace('.', ',') : '';
      const saldoStr = (m.saldoAcumulado !== undefined ? m.saldoAcumulado : 0).toFixed(2).replace('.', ',');
      
      csv += `${fecha};${concepto};${acuerdo};${debeStr};${haberStr};${saldoStr}\r\n`;
    });

    // Descargar el archivo
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Historico_Completo_${nombrePrestador.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const mostrarAlerta = (texto, tipo) => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
  };

  const abrirFormulario = (tipo) => {
    setModalAbierto(tipo);
    setFechaTx(localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0]);
    setMontoTx('');
    setObservacionTx('');
    
    if (tipo === 'pago') {
      setConceptoTx('Pago a Prestador');
    } else if (tipo === 'gasto') {
      setConceptoTx('Gasto del Prestador');
    } else {
      setConceptoTx('Ajuste de Cuenta');
      setTipoAjuste('credito');
    }
  };

  const normalizarRol = (r) => {
    if (!r) return '';
    return String(r)
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  };

  // Confirmar y guardar la transacción en la base de datos
  const confirmarTransaccion = async () => {
    const montoNum = parseFloat(montoTx);
    if (isNaN(montoNum) || montoNum <= 0) {
      alert("Por favor ingrese un importe válido mayor a 0.");
      return;
    }
    if (!conceptoTx.trim()) {
      alert("Por favor especifique el concepto de la transacción.");
      return;
    }

    setProcesandoTx(true);
    try {
      let debeInsert = '0';
      let haberInsert = '0';

      if (modalAbierto === 'pago') {
        debeInsert = montoNum.toString();
      } else if (modalAbierto === 'gasto') {
        debeInsert = montoNum.toString();
      } else if (modalAbierto === 'ajuste') {
        if (tipoAjuste === 'credito') {
          haberInsert = montoNum.toString();
        } else {
          debeInsert = montoNum.toString();
        }
      }

      const nuevoMovimiento = {
        id_prestador: prestadorSeleccionado.id_prestador,
        fecha: fechaTx,
        concepto: conceptoTx + (observacionTx ? ` (${observacionTx})` : ''),
        debe: debeInsert,
        haber: haberInsert,
        saldo: '0.00',
        usuario: usuario || 'Sistema',
        acuerdo: 'Ajuste Manual'
      };

      const { error } = await supabase
        .from('movprestadores_motor')
        .insert([nuevoMovimiento]);

      if (error) throw error;

      mostrarAlerta("Transacción registrada con éxito.", "exito");
      setModalAbierto(null);
      
      await cargarPrestadores();
      await cargarMovimientos(prestadorSeleccionado.id_prestador);

    } catch (error) {
      console.error("Error al registrar transacción:", error);
      alert("Error al registrar transacción: " + error.message);
    } finally {
      setProcesandoTx(false);
    }
  };

  const manejarEliminarAjusteManual = async (mov) => {
    const concepto = mov.concepto || 'Ajuste';
    const valHaber = parsearDecimal(mov.haber);
    const valDebe = parsearDecimal(mov.debe);
    const monto = valHaber > 0 ? valHaber : valDebe;
    const tipo = valHaber > 0 ? 'Crédito' : 'Débito/Pago';

    const confirmar = window.confirm(
      `¿Está seguro de que desea eliminar este movimiento manual?\n\n` +
      `Concepto: ${concepto}\n` +
      `Tipo: ${tipo}\n` +
      `Monto: $${monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}\n\n` +
      `Esta acción eliminará el registro de forma permanente de la cuenta corriente del profesional.`
    );

    if (!confirmar) return;

    try {
      const { error } = await supabase
        .from('movprestadores_motor')
        .delete()
        .eq('id_mov', mov.id_mov);

      if (error) throw error;

      mostrarAlerta("Movimiento manual eliminado con éxito.", "exito");
      await cargarPrestadores();
      if (prestadorSeleccionado) {
        await cargarMovimientos(prestadorSeleccionado.id_prestador);
      }
      if (globalResults.length > 0) {
        setGlobalResults(prev => prev.filter(item => item.id_mov !== mov.id_mov));
      }
    } catch (err) {
      console.error("Error al eliminar movimiento:", err);
      alert("Error al eliminar el movimiento: " + err.message);
    }
  };

  const listaPeriodos = [
    { id: 202610, nombre: 'Octubre 2026' },
    { id: 202609, nombre: 'Septiembre 2026' },
    { id: 202608, nombre: 'Agosto 2026' },
    { id: 202607, nombre: 'Julio 2026' },
    { id: 202606, nombre: 'Junio 2026' },
    { id: 202605, nombre: 'Mayo 2026' },
    { id: 202604, nombre: 'Abril 2026' },
    { id: 202603, nombre: 'Marzo 2026' }
  ];

  const abrirModalProyeccion = () => {
    setModalProyeccionAbierto(true);
    setFiltroPacienteProyeccion('');
    const fechaTrabajo = localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0];
    const anio = parseInt(fechaTrabajo.split('-')[0], 10);
    const mes = parseInt(fechaTrabajo.split('-')[1], 10);
    const perDefecto = (anio * 100) + mes;
    const perFinal = listaPeriodos.some(p => p.id === perDefecto) ? perDefecto : 202609;
    setPeriodoProyeccion(perFinal);
    if (prestadorSeleccionado) {
      cargarProyeccionIngresos(prestadorSeleccionado.id_prestador, perFinal);
    }
  };

  const cargarProyeccionIngresos = async (idPrestador, periodo) => {
    setCargandoProyeccion(true);
    try {
      // 1. Acuerdos mensuales activos
      const { data: acuerdosData, error: errAc } = await supabase
        .from('acuerdos_motor')
        .select('*')
        .eq('tipo_acuerdo', 'MENSUAL')
        .eq('estado', 'ACTIVO');

      if (errAc) throw errAc;

      // 2. Pacientes
      const { data: pacientesData, error: errPac } = await supabase
        .from('pacientes_motor')
        .select('id_paciente, nombre_apellido, obra_social');
      if (errPac) throw errPac;
      const pacMap = {};
      (pacientesData || []).forEach(p => pacMap[p.id_paciente] = p);

      // 3. Prestaciones
      const { data: prestacionesData, error: errPres } = await supabase
        .from('prestaciones_motor')
        .select('id_prestacion, nombre_prestacion');
      if (errPres) throw errPres;
      const prestMap = {};
      (prestacionesData || []).forEach(pr => prestMap[pr.id_prestacion] = pr.nombre_prestacion);

      // 4. Usuarios para resolver profesionales de sesiones_fijas
      const { data: usersData, error: errUsers } = await supabase
        .from('users')
        .select('*');
      if (errUsers) throw errUsers;

      // 5. Sesiones fijas
      const { data: sesionesData, error: errSes } = await supabase
        .from('sesiones_fijas')
        .select('*');
      if (errSes) throw errSes;

      // Mapear sesiones por id_paciente
      const sesMap = {};
      (sesionesData || []).forEach(s => {
        let idPacNum = null;
        if (typeof s.paciente_id === 'string' && s.paciente_id.startsWith('00000000-0000-0000-0000-')) {
          idPacNum = parseInt(s.paciente_id.replace('00000000-0000-0000-0000-', ''), 10);
        } else if (!isNaN(parseInt(s.paciente_id, 10))) {
          idPacNum = parseInt(s.paciente_id, 10);
        }
        if (idPacNum) {
          if (!sesMap[idPacNum]) sesMap[idPacNum] = [];
          sesMap[idPacNum].push(s);
        }
      });

      // 6. Cuotas de cuenta corriente para este período
      const { data: cuotasPeriodo, error: errCuotas } = await supabase
        .from('movimientoscuenta_motor')
        .select('*')
        .eq('ciclo_mora', periodo)
        .ilike('tipo_movimiento', 'cuota');
      if (errCuotas) throw errCuotas;

      const idDeudasPeriodo = [...new Set((cuotasPeriodo || []).map(c => c.id_deuda).filter(Boolean))];

      // Recuperar TODOS los movimientos pertenecientes a estas deudas (incluye notas de crédito y pagos)
      let todosMovsDeuda = [];
      for (let i = 0; i < idDeudasPeriodo.length; i += 50) {
        const chunk = idDeudasPeriodo.slice(i, i + 50);
        const { data: chunkMovs, error: errChunk } = await supabase
          .from('movimientoscuenta_motor')
          .select('*')
          .in('id_deuda', chunk);
        if (errChunk) throw errChunk;
        todosMovsDeuda = todosMovsDeuda.concat(chunkMovs || []);
      }

      const deudasMap = {};
      todosMovsDeuda.forEach(m => {
        if (!deudasMap[m.id_deuda]) deudasMap[m.id_deuda] = [];
        deudasMap[m.id_deuda].push(m);
      });

      const idViviana = prestadores.find(p => p.nombre_prestador?.toUpperCase().includes('VIVIANA'))?.id_prestador || 1;
      const PRESTADORES_EXPLICITOS = [
        'JIMENEZ ANA',
        'LAGARDE MARIA',
        'VACA JESSICA',
        'PAZ BARRAZA LAURA',
        'OLIVERA MARINA',
        'VELIZ MATIAS',
        'VELIZ PAULA'
      ].map(n => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());

      const encontrarPrestadorIdLocal = (usuarioNombre, pList) => {
        if (!usuarioNombre) return null;
        const normalizedUser = usuarioNombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const userWords = normalizedUser.split(/\s+/).filter(w => w.length >= 2);

        for (const p of pList) {
          const normalizedPrestador = p.nombre_prestador.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          const prestadorWords = normalizedPrestador.split(/\s+/).filter(w => w.length >= 2);
          if (userWords.every(word => prestadorWords.includes(word))) return p.id_prestador;
        }
        
        for (const p of pList) {
          const normalizedPrestador = p.nombre_prestador.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          const prestadorWords = normalizedPrestador.split(/\s+/).filter(w => w.length >= 2);
          const matches = userWords.filter(word => prestadorWords.includes(word));
          if (matches.length >= 2) return p.id_prestador;
        }
        return null;
      };

      const resultados = [];

      for (const ac of (acuerdosData || [])) {
        const pac = pacMap[ac.id_paciente];
        const nombrePrestacion = prestMap[ac.id_prestacion] || 'Acuerdo Mensual';
        const pacSes = sesMap[ac.id_paciente] || [];

        let totalSesiones = 0;
        const conteoPrestadores = {};
        prestadores.forEach(p => conteoPrestadores[p.id_prestador] = 0);

        pacSes.forEach(s => {
          totalSesiones++;
          const prof = (usersData || []).find(u => u.id === s.profesional_id);
          if (!prof) {
            conteoPrestadores[idViviana] = (conteoPrestadores[idViviana] || 0) + 1;
            return;
          }
          const normProf = prof.nombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          const esExplicito = PRESTADORES_EXPLICITOS.some(n => {
            const pWords = n.split(/\s+/);
            const profWords = normProf.split(/\s+/);
            return pWords.every(w => profWords.includes(w)) || profWords.every(w => pWords.includes(w));
          });

          if (esExplicito) {
            const matchedId = encontrarPrestadorIdLocal(prof.nombre, prestadores);
            if (matchedId) {
              conteoPrestadores[matchedId] = (conteoPrestadores[matchedId] || 0) + 1;
            } else {
              conteoPrestadores[idViviana] = (conteoPrestadores[idViviana] || 0) + 1;
            }
          } else {
            conteoPrestadores[idViviana] = (conteoPrestadores[idViviana] || 0) + 1;
          }
        });

        const sesionesEstePrestador = conteoPrestadores[idPrestador] || 0;

        // Solo incluir pacientes donde este prestador tenga sesiones asignadas
        if (sesionesEstePrestador === 0) continue;

        const proporcion = totalSesiones > 0 ? (sesionesEstePrestador / totalSesiones) : 0;
        const cuotaPactadaAcuerdo = parsearDecimal(ac.importe_actual || ac.monto_cuota_base);

        // Buscar la cuota del período para este paciente y acuerdo
        const cuotaMov = (cuotasPeriodo || []).find(m => 
          m.id_paciente === ac.id_paciente && 
          (m.id_acuerdo === ac.id_acuerdo || !m.id_acuerdo)
        );

        let totalNotasCredito = 0;
        let totalPagado = 0;
        let saldoPendiente = cuotaPactadaAcuerdo;
        let estadoCobro = 'NO_COBRADO';

        if (cuotaMov && cuotaMov.id_deuda) {
          const movsDeuda = deudasMap[cuotaMov.id_deuda] || [];
          let dTot = 0;
          let hTot = 0;

          movsDeuda.forEach(m => {
            const d = parsearDecimal(m.debe);
            const h = parsearDecimal(m.haber);
            dTot += d;
            hTot += h;
            const tipo = (m.tipo_movimiento || '').toLowerCase();
            if (tipo === 'pago') totalPagado += h;
            if (tipo === 'ajuste') totalNotasCredito += h;
          });

          saldoPendiente = Math.max(0, Math.round((dTot - hTot) * 100) / 100);

          if (saldoPendiente <= 0.01 && dTot > 0) {
            estadoCobro = 'COBRADO';
          } else if (totalPagado > 0) {
            estadoCobro = 'PARCIAL';
          } else {
            estadoCobro = 'NO_COBRADO';
          }
        }

        const ingresoEstimado = Math.round(cuotaPactadaAcuerdo * proporcion);
        let ingresoCobrado = 0;
        let ingresoPendiente = 0;

        if (estadoCobro === 'COBRADO') {
          ingresoCobrado = ingresoEstimado;
        } else if (estadoCobro === 'PARCIAL') {
          const baseDiv = cuotaPactadaAcuerdo > 0 ? cuotaPactadaAcuerdo : 1;
          const pctPagado = Math.min(1, totalPagado / baseDiv);
          ingresoCobrado = Math.round(ingresoEstimado * pctPagado);
          ingresoPendiente = ingresoEstimado - ingresoCobrado;
        } else {
          ingresoPendiente = ingresoEstimado;
        }

        resultados.push({
          id_acuerdo: ac.id_acuerdo,
          id_paciente: ac.id_paciente,
          paciente: pac ? pac.nombre_apellido : `Paciente #${ac.id_paciente}`,
          obra_social: pac?.obra_social || 'Particular',
          prestacion: nombrePrestacion,
          importeAcuerdo: cuotaPactadaAcuerdo,
          cuotaPactada: cuotaPactadaAcuerdo,
          totalNotasCredito,
          totalPagado,
          saldoPendiente,
          sesionesEstePrestador,
          totalSesiones,
          porcentaje: (proporcion * 100).toFixed(1) + '%',
          ingresoEstimado,
          ingresoCobrado,
          montoCobrado: ingresoCobrado,
          ingresoPendiente,
          estadoCobro,
          dia_vencimiento: ac.dia_vencimiento || 10
        });
      }

      resultados.sort((a, b) => a.paciente.localeCompare(b.paciente));
      setDatosProyeccion(resultados);

    } catch (err) {
      console.error("Error al cargar proyección de ingresos:", err);
      alert("Error al cargar proyección: " + err.message);
    } finally {
      setCargandoProyeccion(false);
    }
  };

  const descargarProyeccionExcel = (prestadorNombre, periodoNombre) => {
    const BOM = "\uFEFF";
    let csv = "sep=;\n";
    csv += `Proyección de Ingresos por Paciente - ${prestadorNombre} (${periodoNombre})\n\n`;
    csv += "Paciente;Obra Social;Prestación / Acuerdo Mensual;Cuota Pactada ($);Notas Crédito / Obra Social ($);Saldo a Pagar Paciente ($);Sesiones Asignadas;Total Sesiones;Participación (%);Ingreso Estimado Prestador ($);Estado Cobranza\r\n";

    datosProyeccion.forEach(d => {
      const estadoStr = d.estadoCobro === 'COBRADO' ? 'Cobrado' : d.estadoCobro === 'PARCIAL' ? 'Cobro Parcial' : 'No Cobrado';
      csv += `"${d.paciente}";"${d.obra_social}";"${d.prestacion}";${d.cuotaPactada};${d.totalNotasCredito};${d.saldoPendiente};${d.sesionesEstePrestador};${d.totalSesiones};"${d.porcentaje}";${d.ingresoEstimado};"${estadoStr}"\r\n`;
    });

    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Proyeccion_Ingresos_${prestadorNombre.replace(/\s+/g, '_')}_${periodoNombre.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalHaber = movimientos.reduce((acc, m) => acc + parsearDecimal(m.haber), 0);
  const totalDebe = movimientos.reduce((acc, m) => acc + parsearDecimal(m.debe), 0);
  const saldoFinal = totalHaber - totalDebe;

  const movimientosFiltrados = movimientos.filter(m => {
    if (!filtroConcepto.trim()) return true;
    const term = filtroConcepto.toLowerCase();
    const concepto = (m.concepto || '').toLowerCase();
    const acuerdo = (m.acuerdo || '').toLowerCase();
    return concepto.includes(term) || acuerdo.includes(term);
  });

  const totalDebeFiltrado = movimientosFiltrados.reduce((sum, m) => sum + parsearDecimal(m.debe), 0);
  const totalHaberFiltrado = movimientosFiltrados.reduce((sum, m) => sum + parsearDecimal(m.haber), 0);
  const balanceFiltrado = totalHaberFiltrado - totalDebeFiltrado;

  const globalTotalDebe = globalResults.reduce((sum, m) => sum + parsearDecimal(m.debe), 0);
  const globalTotalHaber = globalResults.reduce((sum, m) => sum + parsearDecimal(m.haber), 0);
  const globalBalance = globalTotalHaber - globalTotalDebe;

  return (
    <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', fontFamily: 'Segoe UI, system-ui, sans-serif', color: '#1e293b' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '18px', marginBottom: '25px' }}>
        <div>
          <h2 style={{ color: '#0f172a', margin: 0, fontSize: '22px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🩺💼 Ficha Integral de Prestadores
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Gestioná honorarios, pagos, gastos y saldos corrientes de los profesionales.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {tieneAccesoReporte && (
            <button
              onClick={() => {
                setModalReporteAbierto(true);
                cargarReporteIngresos();
              }}
              style={{ background: '#e11d48', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.background = '#be123c'}
              onMouseOut={(e) => e.target.style.background = '#e11d48'}
            >
              📊 Ver Promedios Mensuales
            </button>
          )}
          <button
            onClick={onVolver}
            style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569', transition: 'background 0.2s' }}
            onMouseOver={(e) => e.target.style.background = '#e2e8f0'}
            onMouseOut={(e) => e.target.style.background = '#f1f5f9'}
          >
            ← Volver al Menú
          </button>
        </div>
      </div>

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

      <div style={{ marginBottom: '25px', background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>
          Seleccione un Profesional de la lista:
        </label>
        {cargandoPrestadores ? (
          <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>Cargando profesionales...</p>
        ) : (
          <select
            value={prestadorSeleccionado?.id_prestador || ''}
            onChange={(e) => {
              const p = prestadores.find(x => String(x.id_prestador) === String(e.target.value));
              setPrestadorSeleccionado(p || null);
            }}
            style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', background: '#fff', fontWeight: '600', color: '#0f172a' }}
          >
            <option value="">-- Seleccionar Prestador --</option>
            {prestadores.map(p => (
              <option key={p.id_prestador} value={p.id_prestador}>
                {p.nombre_prestador} {p.especialidad ? `(${p.especialidad})` : ''} - Saldo: ${p.saldoConsolidado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </option>
            ))}
          </select>
        )}
      </div>

      {!prestadorSeleccionado && (
        <div style={{ marginTop: '20px', background: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', fontWeight: 'bold', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🔍 Buscador y Sumarizador Global (Todos los Profesionales)
          </h3>
          <p style={{ margin: '0 0 15px 0', fontSize: '13px', color: '#64748b' }}>
            Buscá un concepto o número de acuerdo/referencia en toda la base de datos para ver el total liquidado de todos los prestadores juntos.
          </p>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <input 
              type="text"
              value={globalSearchTerm}
              onChange={(e) => {
                const val = e.target.value;
                setGlobalSearchTerm(val);
                if (!val.trim()) {
                  setGlobalResults([]);
                }
              }}
              placeholder="Ej: Subsidio de Salud Julio 2026, Deuda #953, Acuerdo #784..."
              style={{ flex: 1, padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', outline: 'none', background: '#fff' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') ejecutarBusquedaGlobal();
              }}
            />
            {globalSearchTerm && (
              <button
                onClick={() => {
                  setGlobalSearchTerm('');
                  setGlobalResults([]);
                }}
                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
              >
                Limpiar
              </button>
            )}
            <button
              onClick={ejecutarBusquedaGlobal}
              disabled={cargandoGlobal}
              style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {cargandoGlobal ? 'Buscando...' : '🔍 Buscar y Sumar'}
            </button>
          </div>

          {globalResults.length > 0 && (
            <div>
              {/* Tarjetas de Resumen Global */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                <div style={{ background: '#fff', padding: '15px', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Total Debe (Global)</span>
                  <h4 style={{ margin: '4px 0 0 0', fontSize: '18px', color: '#b91c1c', fontWeight: 'bold' }}>
                    ${globalTotalDebe.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h4>
                </div>
                <div style={{ background: '#fff', padding: '15px', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Total Haber (Global)</span>
                  <h4 style={{ margin: '4px 0 0 0', fontSize: '18px', color: '#15803d', fontWeight: 'bold' }}>
                    ${globalTotalHaber.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h4>
                </div>
                <div style={{ background: '#fff', padding: '15px', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                  <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Saldo Neto (Global)</span>
                  <h4 style={{ margin: '4px 0 0 0', fontSize: '18px', color: globalBalance >= 0 ? '#15803d' : '#b91c1c', fontWeight: 'bold' }}>
                    ${globalBalance.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </h4>
                </div>
              </div>

              {/* Botón Descarga Excel */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '15px' }}>
                <button
                  onClick={() => manejarDescargaExcel(globalResults, `Reporte_Global_${globalSearchTerm.replace(/\s+/g, '_')}`)}
                  style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  📥 Descargar Resultados (Excel)
                </button>
              </div>

              {/* Tabla de Resultados */}
              <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                      <th style={{ padding: '12px 10px' }}>Fecha</th>
                      <th style={{ padding: '12px 10px' }}>Profesional</th>
                      <th style={{ padding: '12px 10px' }}>Concepto</th>
                      <th style={{ padding: '12px 10px' }}>Acuerdo / Ref</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right' }}>Debe</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right' }}>Haber</th>
                      <th style={{ padding: '12px 10px', textAlign: 'center', width: '90px' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {globalResults.map((m, idx) => {
                      const valDebe = parsearDecimal(m.debe);
                      const valHaber = parsearDecimal(m.haber);
                      return (
                        <tr key={m.id_mov || idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap', color: '#475569' }}>
                            {m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/F'}
                          </td>
                          <td style={{ padding: '10px', color: '#0f172a', fontWeight: 'bold' }}>
                            {getNombrePrestador(m.id_prestador)}
                          </td>
                          <td style={{ padding: '10px', color: '#1e293b' }}>
                            {m.concepto || 'S/D'}
                          </td>
                          <td style={{ padding: '10px', color: '#64748b' }}>
                            <span style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                              {m.acuerdo || '-'}
                            </span>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', color: valDebe > 0 ? '#b91c1c' : '#94a3b8' }}>
                            {valDebe > 0 ? `$${valDebe.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', color: valHaber > 0 ? '#15803d' : '#94a3b8' }}>
                            {valHaber > 0 ? `$${valHaber.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            {m.acuerdo === 'Ajuste Manual' && (
                              <button
                                onClick={() => manejarEliminarAjusteManual(m)}
                                title="Eliminar este movimiento manual"
                                style={{
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  border: '1px solid #fca5a5',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  fontWeight: 'bold',
                                  transition: 'all 0.2s',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.background = '#dc2626';
                                  e.currentTarget.style.color = '#fff';
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.background = '#fee2e2';
                                  e.currentTarget.style.color = '#dc2626';
                                }}
                              >
                                🗑️ Eliminar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {globalResults.length === 0 && globalSearchTerm && !cargandoGlobal && (
            <p style={{ margin: '15px 0 0 0', color: '#64748b', fontStyle: 'italic', textAlign: 'center' }}>
              No se encontraron liquidaciones con ese concepto o referencia en ningún profesional.
            </p>
          )}
        </div>
      )}


      {prestadorSeleccionado && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '25px' }}>
            
            <div style={{ padding: '20px', borderRadius: '12px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Saldo Final Corriente
              </span>
              <span style={{ fontSize: '24px', fontWeight: '800', color: saldoFinal >= 0 ? '#15803d' : '#b91c1c', marginTop: '6px' }}>
                ${saldoFinal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: '11px', color: '#60a5fa', marginTop: '4px' }}>
                Haber (Acumulado) - Debe (Pagado)
              </span>
            </div>

            <div style={{ padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
                Total Honorarios (Haber)
              </span>
              <span style={{ display: 'block', fontSize: '20px', fontWeight: 'bold', color: '#0f172a', marginTop: '6px' }}>
                ${totalHaber.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '4px' }}>
                Sesiones validadas + Ajustes de crédito
              </span>
            </div>

            <div style={{ padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
                Total Pagado / Gastos (Debe)
              </span>
              <span style={{ display: 'block', fontSize: '20px', fontWeight: 'bold', color: '#0f172a', marginTop: '6px' }}>
                ${totalDebe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '4px' }}>
                Adelantos + Liquidaciones + Ajustes de débito
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
            <button
              onClick={() => abrirFormulario('pago')}
              style={{ flex: 1, minWidth: '170px', padding: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.background = '#059669'}
              onMouseOut={(e) => e.target.style.background = '#10b981'}
            >
              💵 Registrar Pago (al Debe)
            </button>

            <button
              onClick={() => abrirFormulario('gasto')}
              style={{ flex: 1, minWidth: '170px', padding: '12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.background = '#dc2626'}
              onMouseOut={(e) => e.target.style.background = '#ef4444'}
            >
              📉 Registrar Gasto (al Debe)
            </button>

            <button
              onClick={() => abrirFormulario('ajuste')}
              style={{ flex: 1, minWidth: '170px', padding: '12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.background = '#d97706'}
              onMouseOut={(e) => e.target.style.background = '#f59e0b'}
            >
              ⚙️ Registrar Ajuste
            </button>

            <button
              onClick={abrirModalProyeccion}
              style={{ flex: 1.2, minWidth: '220px', padding: '12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s', boxShadow: '0 2px 6px rgba(99,102,241,0.25)' }}
              onMouseOver={(e) => e.target.style.background = '#4f46e5'}
              onMouseOut={(e) => e.target.style.background = '#6366f1'}
            >
              👥 Proyección por Paciente (Mensual)
            </button>
          </div>

          {modalAbierto && (
            <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '12px', border: '1px solid #cbd5e1', marginBottom: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '10px', marginBottom: '15px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>
                  {modalAbierto === 'pago' && '💵 Formulario de Pago a Prestador'}
                  {modalAbierto === 'gasto' && '📉 Formulario de Gasto de Prestador'}
                  {modalAbierto === 'ajuste' && '⚙️ Formulario de Ajuste Manual'}
                </h4>
                <button onClick={() => setModalAbierto(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Monto ($) *</label>
                  <input
                    type="number"
                    value={montoTx}
                    onChange={(e) => setMontoTx(e.target.value)}
                    placeholder="Ej: 45000"
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Fecha *</label>
                  <input
                    type="date"
                    value={fechaTx}
                    onChange={(e) => setFechaTx(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                  />
                </div>
              </div>

              {modalAbierto === 'ajuste' && (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Tipo de Ajuste *</label>
                  <select
                    value={tipoAjuste}
                    onChange={(e) => setTipoAjuste(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', background: '#fff' }}
                  >
                    <option value="credito">Crédito (Suma al Haber)</option>
                    <option value="debito">Débito (Resta al Debe)</option>
                  </select>
                </div>
              )}

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Concepto *</label>
                <input
                  type="text"
                  value={conceptoTx}
                  onChange={(e) => setConceptoTx(e.target.value)}
                  placeholder="Ej: Liquidación quincenal, Material didáctico, etc."
                  style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Nota / Detalle Adicional</label>
                <input
                  type="text"
                  value={observacionTx}
                  onChange={(e) => setObservacionTx(e.target.value)}
                  placeholder="Opcional..."
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
                  onClick={confirmarTransaccion}
                  disabled={procesandoTx}
                  style={{
                    padding: '8px 20px',
                    background: modalAbierto === 'pago' ? '#10b981' : modalAbierto === 'gasto' ? '#ef4444' : '#f59e0b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600'
                  }}
                >
                  {procesandoTx ? 'Guardando...' : 'Confirmar Registro'}
                </button>
              </div>
            </div>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ fontSize: '16px', color: '#0f172a', fontWeight: 'bold', margin: 0 }}>
                📋 Extracto de Cuenta Corriente {filtroConcepto ? '(Filtrado)' : '(Completo)'}
              </h3>
              {movimientosFiltrados.length > 0 && (
                <button
                  onClick={() => manejarDescargaExcel(movimientosFiltrados, prestadorSeleccionado.nombre_prestador)}
                  style={{ padding: '8px 16px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  📥 Descargar Liquidación {filtroConcepto ? 'Filtrada' : ''} (Excel)
                </button>
              )}
            </div>

            {/* Panel de Filtro de Conceptos y Totales de Filtro */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569', minWidth: '150px' }}>🔍 Filtrar Concepto / Ref:</label>
                <input 
                  type="text"
                  value={filtroConcepto}
                  onChange={(e) => setFiltroConcepto(e.target.value)}
                  placeholder="Ej: Subsidio de Salud Julio 2026, Deuda #953, Acuerdo #784, etc."
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#fff' }}
                />
                {filtroConcepto && (
                  <button 
                    onClick={() => setFiltroConcepto('')}
                    style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >
                    Limpiar
                  </button>
                )}
              </div>
              {filtroConcepto && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginTop: '5px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                  <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Total Debe (Filtro)</span>
                    <h4 style={{ margin: '4px 0 0 0', fontSize: '15px', color: '#b91c1c', fontWeight: 'bold' }}>
                      ${totalDebeFiltrado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h4>
                  </div>
                  <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Total Haber (Filtro)</span>
                    <h4 style={{ margin: '4px 0 0 0', fontSize: '15px', color: '#15803d', fontWeight: 'bold' }}>
                      ${totalHaberFiltrado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h4>
                  </div>
                  <div style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Saldo Neto (Filtro)</span>
                    <h4 style={{ margin: '4px 0 0 0', fontSize: '15px', color: balanceFiltrado >= 0 ? '#15803d' : '#b91c1c', fontWeight: 'bold' }}>
                      ${balanceFiltrado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </h4>
                  </div>
                </div>
              )}
            </div>

            {cargandoMovimientos ? (
              <p style={{ fontSize: '14px', color: '#64748b' }}>Cargando extracto...</p>
            ) : movimientosFiltrados.length === 0 ? (
              <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                No se registran movimientos con los filtros aplicados.
              </p>
            ) : (
              <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                      <th style={{ padding: '12px 10px' }}>Fecha</th>
                      <th style={{ padding: '12px 10px' }}>Concepto</th>
                      <th style={{ padding: '12px 10px' }}>Acuerdo / Ref</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right' }}>Debe (Pagos/Gastos)</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right' }}>Haber (Honorarios)</th>
                      <th style={{ padding: '12px 10px', textAlign: 'right' }}>Saldo Acumulado</th>
                      <th style={{ padding: '12px 10px', textAlign: 'center', width: '90px' }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientosFiltrados.map((m, idx) => {
                      const valDebe = parsearDecimal(m.debe);
                      const valHaber = parsearDecimal(m.haber);
                      return (
                        <tr key={m.id_mov || idx} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background 0.15s' }}>
                          <td style={{ padding: '10px', whiteSpace: 'nowrap', fontWeight: '500', color: '#475569' }}>
                            {m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/F'}
                          </td>
                          <td style={{ padding: '10px', color: '#1e293b', fontWeight: '600' }}>
                            {m.concepto || 'S/D'}
                          </td>
                          <td style={{ padding: '10px', color: '#64748b' }}>
                            <span style={{ fontSize: '11px', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                              {m.acuerdo || '-'}
                            </span>
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', color: valDebe > 0 ? '#b91c1c' : '#94a3b8', fontWeight: '600' }}>
                            {valDebe > 0 ? `$${valDebe.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', color: valHaber > 0 ? '#15803d' : '#94a3b8', fontWeight: '600' }}>
                            {valHaber > 0 ? `$${valHaber.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'right', color: m.saldoAcumulado >= 0 ? '#15803d' : '#b91c1c', fontWeight: 'bold' }}>
                            ${m.saldoAcumulado.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '10px', textAlign: 'center' }}>
                            {m.acuerdo === 'Ajuste Manual' && (
                              <button
                                onClick={() => manejarEliminarAjusteManual(m)}
                                title="Eliminar este movimiento manual"
                                style={{
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  border: '1px solid #fca5a5',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '11px',
                                  fontWeight: 'bold',
                                  transition: 'all 0.2s',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.background = '#dc2626';
                                  e.currentTarget.style.color = '#fff';
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.background = '#fee2e2';
                                  e.currentTarget.style.color = '#dc2626';
                                }}
                              >
                                🗑️ Eliminar
                              </button>
                            )}
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
      {/* Modal Reporte de Ingresos Confidencial */}
      {modalReporteAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '16px', width: '90%', maxWidth: '850px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', border: '1px solid #e2e8f0' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e11d48', paddingBottom: '15px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#e11d48', fontSize: '20px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📊 Reporte Confidencial: Promedios Mensuales de Ingresos
                </h3>
                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
                  Suma de honorarios liquidados por mes (neto de débitos/reversos, antes de pagos).
                </p>
              </div>
              <button 
                onClick={() => setModalReporteAbierto(false)} 
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '12px 16px', borderRadius: '8px', color: '#9f1239', fontSize: '13px', fontWeight: 'bold', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              ⚠️ Información sumamente sensible y reservada. Solo visible para usuarios autorizados.
            </div>

            {cargandoReporte ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '50px' }}>
                <div style={{ width: '40px', height: '40px', border: '4px solid #f3f4f6', borderTop: '4px solid #e11d48', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ marginTop: '15px', color: '#64748b', fontSize: '14px', fontWeight: '500' }}>Calculando históricos y promedios...</p>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 'bold' }}>
                      <th style={{ padding: '12px 16px' }}>Prestador</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', width: '180px' }}>Promedio Mensual ($)</th>
                      <th style={{ padding: '12px 16px' }}>Desglose por Mes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datosReporte.length > 0 ? (
                      datosReporte.map((p, i) => (
                        <tr key={p.id_prestador} style={{ borderBottom: '1px solid #edf2f7', background: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                          <td style={{ padding: '12px 16px', fontWeight: 'bold', color: '#1e293b' }}>
                            {p.nombre_prestador}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '800', color: '#2563eb', fontSize: '14px' }}>
                            ${p.promedio.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#64748b', fontSize: '12px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {p.desglose.map((d, idx) => (
                                <span key={idx} style={{ background: '#edf2f7', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                                  <strong>{d.mes}</strong>: ${d.monto.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="3" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                          No se encontraron datos de movimientos.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '15px' }}>
              <button 
                onClick={descargarReporteIngresosExcel} 
                disabled={datosReporte.length === 0 || cargandoReporte}
                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                📥 Descargar Excel
              </button>
              <button 
                onClick={() => setModalReporteAbierto(false)} 
                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', color: '#475569' }}
              >
                Cerrar
              </button>
            </div>
            
          </div>
        </div>
      )}

      {/* Modal Proyección de Ingresos por Paciente (Acuerdos Mensuales) */}
      {modalProyeccionAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '16px', width: '94%', maxWidth: '1200px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.3)', border: '1px solid #e2e8f0' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #6366f1', paddingBottom: '15px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#4338ca', fontSize: '20px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  👥 Proyección de Ingresos por Paciente: {prestadorSeleccionado?.nombre_prestador}
                </h3>
                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
                  Estimación de honorarios calculados sobre <strong>Acuerdos Mensuales</strong> activos según la distribución de sesiones fijas asignadas.
                </p>
              </div>
              <button 
                onClick={() => setModalProyeccionAbierto(false)} 
                style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            {/* Controles de Selección de Período y Filtro */}
            <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center', background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>📅 Período:</label>
                <select
                  value={periodoProyeccion}
                  onChange={(e) => {
                    const per = parseInt(e.target.value, 10);
                    setPeriodoProyeccion(per);
                    if (prestadorSeleccionado) {
                      cargarProyeccionIngresos(prestadorSeleccionado.id_prestador, per);
                    }
                  }}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '600', color: '#1e293b', background: '#fff', outline: 'none' }}
                >
                  {listaPeriodos.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>🔍 Buscar:</label>
                <input
                  type="text"
                  placeholder="Filtrar por paciente o prestación..."
                  value={filtroPacienteProyeccion}
                  onChange={(e) => setFiltroPacienteProyeccion(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff', outline: 'none' }}
                />
                {filtroPacienteProyeccion && (
                  <button
                    onClick={() => setFiltroPacienteProyeccion('')}
                    style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            {/* Tarjetas de Resumen KPI */}
            {(() => {
              const filtrados = datosProyeccion.filter(d => 
                !filtroPacienteProyeccion.trim() || 
                d.paciente.toLowerCase().includes(filtroPacienteProyeccion.toLowerCase()) ||
                d.prestacion.toLowerCase().includes(filtroPacienteProyeccion.toLowerCase())
              );
              const totalEst = filtrados.reduce((acc, d) => acc + (d.ingresoEstimado || 0), 0);
              const totalCob = filtrados.reduce((acc, d) => acc + (d.ingresoCobrado || 0), 0);
              const totalPend = filtrados.reduce((acc, d) => acc + (d.ingresoPendiente || 0), 0);

              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '15px', marginBottom: '20px' }}>
                  <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Ingreso Proyectado Total</span>
                    <h4 style={{ margin: '4px 0 0 0', fontSize: '20px', color: '#1e293b', fontWeight: '800' }}>
                      ${totalEst.toLocaleString('es-AR')}
                    </h4>
                  </div>
                  <div style={{ background: '#f0fdf4', padding: '12px 16px', borderRadius: '10px', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#166534', textTransform: 'uppercase' }}>🟢 Ya Cobrado</span>
                    <h4 style={{ margin: '4px 0 0 0', fontSize: '20px', color: '#15803d', fontWeight: '800' }}>
                      ${totalCob.toLocaleString('es-AR')}
                    </h4>
                  </div>
                  <div style={{ background: '#fef2f2', padding: '12px 16px', borderRadius: '10px', border: '1px solid #fecaca', textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#991b1b', textTransform: 'uppercase' }}>🔴 Pendiente de Cobro</span>
                    <h4 style={{ margin: '4px 0 0 0', fontSize: '20px', color: '#b91c1c', fontWeight: '800' }}>
                      ${totalPend.toLocaleString('es-AR')}
                    </h4>
                  </div>
                  <div style={{ background: '#f8fafc', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>Pacientes Asignados</span>
                    <h4 style={{ margin: '4px 0 0 0', fontSize: '20px', color: '#4338ca', fontWeight: '800' }}>
                      {filtrados.length}
                    </h4>
                  </div>
                </div>
              );
            })()}

            {/* Contenido / Tabla */}
            {cargandoProyeccion ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '40px' }}>
                <div style={{ width: '36px', height: '36px', border: '4px solid #e2e8f0', borderTop: '4px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <p style={{ marginTop: '12px', color: '#64748b', fontSize: '14px', fontWeight: '500' }}>Calculando proyección y estado de cuotas...</p>
              </div>
            ) : (() => {
              const filtrados = datosProyeccion.filter(d => 
                !filtroPacienteProyeccion.trim() || 
                d.paciente.toLowerCase().includes(filtroPacienteProyeccion.toLowerCase()) ||
                d.prestacion.toLowerCase().includes(filtroPacienteProyeccion.toLowerCase())
              );

              if (filtrados.length === 0) {
                return (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                    <p style={{ margin: 0, color: '#64748b', fontStyle: 'italic', textAlign: 'center' }}>
                      No se encontraron pacientes con acuerdos mensuales activos vinculados a este profesional para el período seleccionado.
                    </p>
                  </div>
                );
              }

              return (
                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px', marginBottom: '20px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', fontWeight: 'bold' }}>
                        <th style={{ padding: '12px 14px' }}>Paciente</th>
                        <th style={{ padding: '12px 14px' }}>Obra Social</th>
                        <th style={{ padding: '12px 14px' }}>Prestación (Acuerdo Mensual)</th>
                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>Cuota Pactada ($)</th>
                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>N. Crédito / O. Social ($)</th>
                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>Saldo a Pagar ($)</th>
                        <th style={{ padding: '12px 14px', textAlign: 'center' }}>Sesiones / Part.</th>
                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>Ingreso Prestador ($)</th>
                        <th style={{ padding: '12px 14px', textAlign: 'center' }}>Estado de Cobro</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.map((d, i) => (
                        <tr key={d.id_acuerdo || i} style={{ borderBottom: '1px solid #edf2f7', background: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                          <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#1e293b' }}>
                            {d.paciente}
                          </td>
                          <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '12px' }}>
                            {d.obra_social}
                          </td>
                          <td style={{ padding: '12px 14px', color: '#334155' }}>
                            <span style={{ background: '#eef2ff', color: '#4338ca', padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: '600' }}>
                              {d.prestacion}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', color: '#475569', fontWeight: '600' }}>
                            ${(d.cuotaPactada || 0).toLocaleString('es-AR')}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            {d.totalNotasCredito > 0 ? (
                              <span style={{ color: '#7c3aed', fontWeight: '600', fontSize: '12px' }}>
                                -${d.totalNotasCredito.toLocaleString('es-AR')}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8' }}>-</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                            {d.saldoPendiente > 0 ? (
                              <span style={{ color: '#b91c1c', fontWeight: 'bold' }}>
                                ${d.saldoPendiente.toLocaleString('es-AR')}
                              </span>
                            ) : (
                              <span style={{ color: '#15803d', fontWeight: '600' }}>
                                $0 (Al día)
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', color: '#475569' }}>
                            <span style={{ fontSize: '12px', fontWeight: '600' }}>
                              {d.sesionesEstePrestador} de {d.totalSesiones} ({d.porcentaje})
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: '800', fontSize: '14px', color: d.estadoCobro === 'COBRADO' ? '#15803d' : d.estadoCobro === 'PARCIAL' ? '#b45309' : '#b91c1c' }}>
                            ${(d.ingresoEstimado || 0).toLocaleString('es-AR')}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            {d.estadoCobro === 'COBRADO' && (
                              <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                🟢 Cobrado
                              </span>
                            )}
                            {d.estadoCobro === 'NO_COBRADO' && (
                              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                <span style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  🔴 No cobrado
                                </span>
                                {d.saldoPendiente > 0 && (
                                  <span style={{ fontSize: '10px', color: '#dc2626', fontWeight: '600' }}>
                                    Debe ${d.saldoPendiente.toLocaleString('es-AR')}
                                  </span>
                                )}
                              </div>
                            )}
                            {d.estadoCobro === 'PARCIAL' && (
                              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  🟡 Cobro Parcial
                                </span>
                                <span style={{ fontSize: '10px', color: '#b45309', fontWeight: '600' }}>
                                  Pagó ${d.totalPagado.toLocaleString('es-AR')} / Saldo ${d.saldoPendiente.toLocaleString('es-AR')}
                                </span>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '15px' }}>
              <button 
                onClick={() => {
                  const nombrePer = listaPeriodos.find(p => p.id === periodoProyeccion)?.nombre || String(periodoProyeccion);
                  descargarProyeccionExcel(prestadorSeleccionado?.nombre_prestador || 'Prestador', nombrePer);
                }}
                disabled={datosProyeccion.length === 0 || cargandoProyeccion}
                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                📥 Descargar Excel
              </button>
              <button 
                onClick={() => setModalProyeccionAbierto(false)} 
                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '10px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', color: '#475569' }}
              >
                Cerrar
              </button>
            </div>
            
          </div>
        </div>
      )}
      
    </div>
  );
}