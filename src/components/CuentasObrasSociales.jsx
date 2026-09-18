import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase.js';

export default function CuentasObrasSociales({ onVolver, usuario }) {
  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [obrasSocialesLista, setObrasSocialesLista] = useState([]);
  const [obraSocialSeleccionada, setObraSocialSeleccionada] = useState('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('TODOS');

  // Estados para Modal de Cobro a O.S.
  const [modalCobroAbierto, setModalCobroAbierto] = useState(false);
  const [facturaSeleccionada, setFacturaSeleccionada] = useState(null);
  const [formCobro, setFormCobro] = useState({
    obraSocial: '',
    monto: '',
    nroComprobante: '',
    formaPago: 'TRANSFERENCIA BANCARIA',
    banco: 'GALICIA',
    fecha: new Date().toISOString().split('T')[0],
    observaciones: ''
  });
  const [guardandoCobro, setGuardandoCobro] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // Estados para Distribución a Prestadores en Cobro de O.S.
  const [prestadoresList, setPrestadoresList] = useState([]);
  const [distribuirAPrestadores, setDistribuirAPrestadores] = useState(true);
  const [distribucionPorMonto, setDistribucionPorMonto] = useState(false);
  const [sesionesPrestadores, setSesionesPrestadores] = useState({});
  const [montosPrestadores, setMontosPrestadores] = useState({});
  const [cargandoPrestadores, setCargandoPrestadores] = useState(false);

  // Pestañas y Acuerdos de Obra Social
  const [tabActiva, setTabActiva] = useState('libro'); // 'libro' | 'pendientes'
  const [acuerdosOS, setAcuerdosOS] = useState([]);
  const [acuerdosOSPendientes, setAcuerdosOSPendientes] = useState([]);
  const [busquedaPendientes, setBusquedaPendientes] = useState('');
  const [filtroOSAcuerdos, setFiltroOSAcuerdos] = useState('TODAS');
  const [filtroEstadoAcuerdos, setFiltroEstadoAcuerdos] = useState('PENDIENTES'); // 'PENDIENTES' | 'TODOS'

  // Modal Facturar Acuerdo (a Cobrar)
  const [modalFacturarAbierto, setModalFacturarAbierto] = useState(false);
  const [acuerdoAFacturar, setAcuerdoAFacturar] = useState(null);
  const [formFactura, setFormFactura] = useState({
    nroFactura: 'AGOSTO 2026',
    monto: '',
    fecha: new Date().toISOString().split('T')[0]
  });
  const [guardandoFactura, setGuardandoFactura] = useState(false);

  // Modal Editar Factura Emitida
  const [modalEditarFacturaAbierto, setModalEditarFacturaAbierto] = useState(false);
  const [facturaAEditar, setFacturaAEditar] = useState(null);
  const [formEditarFactura, setFormEditarFactura] = useState({
    nroFactura: '',
    monto: '',
    fecha: '',
    observaciones: ''
  });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Acuerdo en proceso de Facturar y Cobrar en 1 Paso
  const [acuerdoAFacturarCobrar, setAcuerdoAFacturarCobrar] = useState(null);

  const cargarDatos = async () => {
    try {
      setCargando(true);

      // 1. Cargar datos en paralelo: pacientes, prestaciones, acuerdos y movimientos
      const [resPacs, resPres, resAcuerdos, resMovs, resPrest] = await Promise.all([
        supabase.from('pacientes_motor').select('id_paciente, nombre_apellido, dni, obra_social'),
        supabase.from('prestaciones_motor').select('*'),
        supabase.from('acuerdos_motor').select('*').order('id_acuerdo', { ascending: false }),
        supabase.from('movimientoscuenta_motor').select('*').eq('id_paciente', 0).order('fecha_movimiento', { ascending: false }),
        supabase.from('prestadores_motor').select('*').order('nombre_prestador', { ascending: true })
      ]);

      if (resMovs.error) throw resMovs.error;

      const pacsData = resPacs.data || [];
      const presData = resPres.data || [];
      const acData = resAcuerdos.data || [];
      const movs = resMovs.data || [];
      setMovimientos(movs);

      // 2. Procesar prestadores activos (excluyendo auxiliares que cobran por hora)
      const AUXILIARES_LIST = ['PULITTA', 'SOTO', 'LIZARRAGA', 'SORANE', 'MASCARENO', 'MASCAREÑO', 'ALBORNOZ', 'LOBO'];
      if (!resPrest.error && resPrest.data) {
        const profesionalesActivos = resPrest.data.filter(p => {
          const esActivo = !p.estado || (p.estado || '').trim().toUpperCase() === 'ACTIVO';
          const normNombre = (p.nombre_prestador || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const esAux = AUXILIARES_LIST.some(aux => normNombre.includes(aux));
          return esActivo && !esAux;
        });
        setPrestadoresList(profesionalesActivos);
      }

      // 3. Procesar lista de Obras Sociales únicas
      const osPacientes = pacsData
        .map(p => (p.obra_social || '').trim().toUpperCase())
        .filter(Boolean);
      const osMovimientos = movs
        .map(m => (m.subtipo || '').trim().toUpperCase())
        .filter(Boolean);
      const todasOS = Array.from(new Set([...osPacientes, ...osMovimientos, 'CETINNE', 'BOREAL', 'SANCOR SALUD', 'SUBSIDIO DE SALUD'])).sort();
      setObrasSocialesLista(todasOS);

      // 4. Identificar y procesar Acuerdos de Obra Social
      const esAcuerdoOS = (ac) => {
        const pr = presData.find(p => p.id_prestacion === ac.id_prestacion || p.id === ac.id_prestacion);
        const prNombre = (pr?.nombre_prestacion || '').toUpperCase();
        const obs = (ac.observaciones || '').toUpperCase();
        const prObs = (pr?.observaciones || '').toUpperCase();
        return prNombre.startsWith('OS-') || prNombre.startsWith('OS ') || obs.includes('OBRA SOCIAL') || obs.includes('OBRA_SOCIAL') || prObs.includes('OBRA_SOCIAL');
      };

      const acsOS = acData.filter(esAcuerdoOS);

      const acuerdosMapeados = acsOS.map(ac => {
        const pac = pacsData.find(p => p.id_paciente === ac.id_paciente);
        const pr = presData.find(p => p.id_prestacion === ac.id_prestacion || p.id === ac.id_prestacion);

        let osNombre = '';
        if (ac.observaciones && ac.observaciones.includes('Cobertura Obra Social:')) {
          const match = ac.observaciones.match(/Cobertura Obra Social:\s*([^[,\n]+)/i);
          if (match && match[1]) osNombre = match[1].trim();
        }
        if (!osNombre && pr?.observaciones && pr.observaciones.includes('OBRA_SOCIAL:')) {
          const match = pr.observaciones.match(/OBRA_SOCIAL:([^\s,\]]+)/i);
          if (match && match[1]) osNombre = match[1].trim();
        }
        if (!osNombre && pac?.obra_social) {
          osNombre = (pac.obra_social || '').trim();
        }
        if (!osNombre) osNombre = 'CETINNE';

        // Detectar si ya fue facturado en movimientoscuenta_motor
        const facturaMov = movs.find(m => m.id_acuerdo === ac.id_acuerdo && (m.tipo_movimiento === 'FACTURA_OS' || parsearMoneda(m.debe) > 0));

        return {
          ...ac,
          paciente: pac,
          prestacion: pr,
          obraSocialNombre: osNombre.toUpperCase(),
          estaFacturado: Boolean(facturaMov),
          facturaMov: facturaMov || null
        };
      });

      setAcuerdosOS(acuerdosMapeados);
      const pendientes = acuerdosMapeados.filter(ac => !ac.estaFacturado && ac.estado !== 'FINALIZADO' && ac.estado !== 'RESCINDIDO');
      setAcuerdosOSPendientes(pendientes);

    } catch (err) {
      console.error('Error al cargar datos de Obras Sociales:', err);
      setMensaje({ texto: 'Error al cargar datos: ' + err.message, tipo: 'error' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const parsearMoneda = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    
    const str = String(val).replace(/\$/g, '').trim();
    
    // Si contiene coma, asumimos formato en español (ej: 246.607,68 o 246607,68)
    if (str.includes(',')) {
      const limpio = str.replace(/\./g, '').replace(',', '.');
      const num = Number(limpio);
      return isNaN(num) ? 0 : num;
    }
    
    // Si no contiene coma pero contiene puntos
    if (str.includes('.')) {
      const partes = str.split('.');
      // Si hay más de un punto, son separadores de miles (ej: 1.246.607)
      if (partes.length > 2) {
        const limpio = str.replace(/\./g, '');
        const num = Number(limpio);
        return isNaN(num) ? 0 : num;
      }
      
      // Si hay un solo punto, puede ser decimal (246607.68) o miles (246.607)
      // Si la parte decimal tiene exactamente 3 dígitos, se asume que es miles (ej: 246.607 o 1.500)
      const decimales = partes[1];
      if (decimales.length === 3) {
        const limpio = str.replace(/\./g, '');
        const num = Number(limpio);
        return isNaN(num) ? 0 : num;
      }
      
      // En cualquier otro caso (ej: 246607.68, 16770.6, 15.5), el punto es decimal
      const num = Number(str);
      return isNaN(num) ? 0 : num;
    }
    
    // Si no tiene puntos ni comas, es un número entero limpio
    const num = Number(str);
    return isNaN(num) ? 0 : num;
  };

  // Mapeo detallado de facturas con su estado de cobro
  const facturasMapeadas = useMemo(() => {
    const facturas = movimientos.filter(m => m.tipo_movimiento === 'FACTURA_OS' || parsearMoneda(m.debe) > 0);
    const cobros = movimientos.filter(m => m.tipo_movimiento === 'PAGO_OS' || parsearMoneda(m.haber) > 0);

    const mapa = {};
    facturas.forEach(f => {
      const montoFactura = parsearMoneda(f.debe);
      // Buscar cobros asociados por id_origen o por id_acuerdo
      const cobrosAsociados = cobros.filter(c => 
        (c.id_origen && String(c.id_origen) === String(f.id_movimiento)) ||
        (f.id_acuerdo && c.id_acuerdo && String(c.id_acuerdo) === String(f.id_acuerdo))
      );
      const totalCobrado = cobrosAsociados.reduce((sum, c) => sum + parsearMoneda(c.haber), 0);
      const saldoPendiente = Math.max(0, montoFactura - totalCobrado);
      const estaSaldada = saldoPendiente <= 0.01;
      const esParcial = totalCobrado > 0 && !estaSaldada;

      mapa[f.id_movimiento] = {
        ...f,
        montoFactura,
        totalCobrado,
        saldoPendiente,
        estaSaldada,
        esParcial,
        cobrosAsociados
      };
    });

    return mapa;
  }, [movimientos]);

  // Facturas pendientes de cobro y cálculo de saldos
  const facturasPendientes = useMemo(() => {
    return Object.values(facturasMapeadas).filter(f => !f.estaSaldada);
  }, [facturasMapeadas]);

  // Facturas totalmente saldadas
  const facturasSaldadas = useMemo(() => {
    return Object.values(facturasMapeadas).filter(f => f.estaSaldada);
  }, [facturasMapeadas]);

  // Filtrado de movimientos
  const movimientosFiltrados = useMemo(() => {
    return movimientos.filter(m => {
      const osMov = (m.subtipo || '').trim().toUpperCase();
      const coincideOS = obraSocialSeleccionada === 'TODAS' || osMov === obraSocialSeleccionada;
      
      const infoFac = facturasMapeadas[m.id_movimiento];
      const esFactura = m.tipo_movimiento === 'FACTURA_OS' || parsearMoneda(m.debe) > 0;
      const esCobro = m.tipo_movimiento === 'PAGO_OS' || parsearMoneda(m.haber) > 0;

      let coincideTipo = true;
      if (filtroTipo === 'PENDIENTES') {
        coincideTipo = esFactura && infoFac && !infoFac.estaSaldada;
      } else if (filtroTipo === 'COBRADAS') {
        coincideTipo = esFactura && infoFac && infoFac.estaSaldada;
      } else if (filtroTipo === 'FACTURAS') {
        coincideTipo = esFactura;
      } else if (filtroTipo === 'COBROS') {
        coincideTipo = esCobro;
      }

      const q = busqueda.toLowerCase().trim();
      const coincideTexto = !q ||
        (m.concepto && m.concepto.toLowerCase().includes(q)) ||
        (m.subtipo && m.subtipo.toLowerCase().includes(q)) ||
        (m.usuario && m.usuario.toLowerCase().includes(q));

      return coincideOS && coincideTipo && coincideTexto;
    });
  }, [movimientos, obraSocialSeleccionada, filtroTipo, busqueda, facturasMapeadas]);

  // Filtrado de acuerdos de Obra Social
  const acuerdosOSPendientesFiltrados = useMemo(() => {
    return acuerdosOS.filter(ac => {
      if (filtroEstadoAcuerdos === 'PENDIENTES' && ac.estaFacturado) return false;
      if (filtroEstadoAcuerdos === 'FACTURADOS' && !ac.estaFacturado) return false;

      if (filtroOSAcuerdos !== 'TODAS' && ac.obraSocialNombre !== filtroOSAcuerdos) return false;

      const q = busquedaPendientes.toLowerCase().trim();
      if (!q) return true;

      const pacNom = (ac.paciente?.nombre_apellido || '').toLowerCase();
      const pacDni = String(ac.paciente?.dni || '');
      const prestNom = (ac.prestacion?.nombre_prestacion || '').toLowerCase();
      const osNom = (ac.obraSocialNombre || '').toLowerCase();

      return pacNom.includes(q) || pacDni.includes(q) || prestNom.includes(q) || osNom.includes(q);
    });
  }, [acuerdosOS, filtroEstadoAcuerdos, filtroOSAcuerdos, busquedaPendientes]);

  // Cálculos de Totales y KPIs
  const totales = useMemo(() => {
    let totalDebe = 0;
    let totalHaber = 0;

    movimientosFiltrados.forEach(m => {
      totalDebe += parsearMoneda(m.debe);
      totalHaber += parsearMoneda(m.haber);
    });

    const saldoPendiente = totalDebe - totalHaber;

    return { totalDebe, totalHaber, saldoPendiente };
  }, [movimientosFiltrados]);

  // Facturas pendientes filtradas según la obra social activa en el modal
  const facturasPendientesModal = useMemo(() => {
    const osActual = (formCobro.obraSocial || '').trim().toUpperCase();
    if (!osActual) return facturasPendientes;
    return facturasPendientes.filter(f => (f.subtipo || '').trim().toUpperCase() === osActual);
  }, [facturasPendientes, formCobro.obraSocial]);

  // Autocompletar sesiones si la factura pertenece a un paciente con sesiones_fijas
  const autocompletarSesionesFactura = async (fac, pList = prestadoresList) => {
    if (!fac) return;
    const lista = (pList && pList.length > 0) ? pList : prestadoresList;
    if (!lista || lista.length === 0) return;

    setCargandoPrestadores(true);
    try {
      let idPaciente = null;
      // 1. Consultar acuerdos_motor si tiene id_acuerdo
      if (fac.id_acuerdo) {
        const { data: acData } = await supabase
          .from('acuerdos_motor')
          .select('id_paciente')
          .eq('id_acuerdo', fac.id_acuerdo)
          .maybeSingle();
        if (acData?.id_paciente) {
          idPaciente = acData.id_paciente;
        }
      }
      // 2. Fallback regex en concepto: "Pac: ... (ID 151)"
      if (!idPaciente && fac.concepto) {
        const m = fac.concepto.match(/ID\s*(\d+)/i);
        if (m && m[1]) idPaciente = parseInt(m[1]);
      }

      if (idPaciente) {
        const uuidTarget = '00000000-0000-0000-0000-' + String(idPaciente).padStart(12, '0');
        const { data: sesiones } = await supabase
          .from('sesiones_fijas')
          .select('*')
          .eq('paciente_id', uuidTarget);

        if (sesiones && sesiones.length > 0) {
          const { data: users } = await supabase.from('users').select('*');
          const idViviana = lista.find(p => p.nombre_prestador.toUpperCase().includes('VIVIANA'))?.id_prestador || lista[0]?.id_prestador;

          const AUXILIARES_LIST = ['PULITTA', 'SOTO', 'LIZARRAGA', 'SORANE', 'MASCARENO', 'MASCAREÑO', 'ALBORNOZ', 'LOBO'];

          const esAuxiliar = (prof) => {
            if (!prof) return true;
            if ((prof.rol || '').toUpperCase().includes('AUXILIAR')) return true;
            const normNombre = (prof.nombre || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (normNombre.includes('POR SESION') || normNombre.includes('SESION')) return true;
            return AUXILIARES_LIST.some(aux => normNombre.includes(aux));
          };

          const encontrarPrestadorId = (usuarioNombre) => {
            if (!usuarioNombre) return null;
            const normalizedUser = usuarioNombre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            if (normalizedUser.includes('por sesion') || normalizedUser.includes('sesion')) return null;
            const userWords = normalizedUser.split(/\s+/).filter(w => w.length >= 2);

            for (const p of lista) {
              const normalizedPrestador = p.nombre_prestador.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
              const prestadorWords = normalizedPrestador.split(/\s+/).filter(w => w.length >= 2);
              if (userWords.every(word => prestadorWords.includes(word))) return p.id_prestador;
            }
            for (const p of lista) {
              const normalizedPrestador = p.nombre_prestador.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
              const prestadorWords = normalizedPrestador.split(/\s+/).filter(w => w.length >= 2);
              const matches = userWords.filter(word => prestadorWords.includes(word));
              if (matches.length >= 2) return p.id_prestador;
            }
            return null;
          };

          const sesActual = {};
          lista.forEach(p => { sesActual[p.id_prestador] = 0; });

          sesiones.forEach(s => {
            const prof = (users || []).find(u => u.id === s.profesional_id);

            // Regla de Negocio: Si la sesión es de un AUXILIAR (Pulitta, Soto, Lizarraga, Sorane, Mascareño, Albornoz, Lobo o rol AUXILIAR),
            // se considera SIEMPRE como sesión de VIVIANA JIMENEZ (el centro). Al auxiliar se le paga por aparte valor hora/fijo.
            if (esAuxiliar(prof)) {
              if (idViviana) {
                sesActual[idViviana] = (sesActual[idViviana] || 0) + 1;
              }
              return;
            }

            // Si es un PROFESIONAL, cobra de la liquidación de la factura de ese paciente
            const matchedId = encontrarPrestadorId(prof.nombre);
            if (matchedId) {
              sesActual[matchedId] = (sesActual[matchedId] || 0) + 1;
            } else if (idViviana) {
              sesActual[idViviana] = (sesActual[idViviana] || 0) + 1;
            }
          });

          setSesionesPrestadores(sesActual);
          return;
        }
      }
      
      // Si no se encontraron sesiones fijas, inicializar en 0
      const sesZero = {};
      lista.forEach(p => { sesZero[p.id_prestador] = 0; });
      setSesionesPrestadores(sesZero);
    } catch (err) {
      console.error('Error al autocompletar sesiones:', err);
    } finally {
      setCargandoPrestadores(false);
    }
  };

  const abrirModalCobro = (factura = null) => {
    // Inicializar montos y sesiones de prestadores
    const montosZero = {};
    const sesZero = {};
    prestadoresList.forEach(p => {
      montosZero[p.id_prestador] = '';
      sesZero[p.id_prestador] = 0;
    });
    setMontosPrestadores(montosZero);
    setSesionesPrestadores(sesZero);
    setDistribuirAPrestadores(true);
    setDistribucionPorMonto(false);

    if (factura) {
      setFacturaSeleccionada(factura);
      const nroFac = factura.concepto?.split(' - ')[0] || ('Factura #' + factura.id_movimiento);
      const saldo = factura.saldoPendiente !== undefined ? factura.saldoPendiente : parsearMoneda(factura.debe);
      setFormCobro({
        obraSocial: factura.subtipo || '',
        monto: String(saldo || ''),
        nroComprobante: '',
        formaPago: 'TRANSFERENCIA BANCARIA',
        banco: 'GALICIA',
        fecha: new Date().toISOString().split('T')[0],
        observaciones: `Cancelación ${nroFac}`
      });
      autocompletarSesionesFactura(factura, prestadoresList);
    } else {
      setFacturaSeleccionada(null);
      const osDefault = obraSocialSeleccionada !== 'TODAS' ? obraSocialSeleccionada : '';
      setFormCobro({
        obraSocial: osDefault,
        monto: '',
        nroComprobante: '',
        formaPago: 'TRANSFERENCIA BANCARIA',
        banco: 'GALICIA',
        fecha: new Date().toISOString().split('T')[0],
        observaciones: ''
      });
    }
    setModalCobroAbierto(true);
  };

  const seleccionarFacturaEnModal = (fac) => {
    if (facturaSeleccionada?.id_movimiento === fac.id_movimiento) {
      setFacturaSeleccionada(null);
      setFormCobro(prev => ({ ...prev, monto: '', observaciones: '' }));
      const sesZero = {};
      prestadoresList.forEach(p => { sesZero[p.id_prestador] = 0; });
      setSesionesPrestadores(sesZero);
    } else {
      setFacturaSeleccionada(fac);
      const nroFac = fac.concepto?.split(' - ')[0] || ('Factura #' + fac.id_movimiento);
      setFormCobro(prev => ({
        ...prev,
        obraSocial: fac.subtipo || prev.obraSocial,
        monto: String(fac.saldoPendiente || fac.montoFactura || ''),
        observaciones: `Cancelación ${nroFac}`
      }));
      autocompletarSesionesFactura(fac, prestadoresList);
    }
  };

  // Handler para registrar cobro / liquidación de Obra Social
  const guardarCobroOS = async (e) => {
    e.preventDefault();
    const montoNum = parsearMoneda(formCobro.monto);
    if (!montoNum || montoNum <= 0) {
      alert('Por favor, ingresá un importe válido y mayor a 0.');
      return;
    }
    const osNombre = (formCobro.obraSocial || '').trim().toUpperCase();
    if (!osNombre) {
      alert('Por favor, indicá la Obra Social.');
      return;
    }

    // Validar distribución a prestadores si está activada
    let prestadoresAcreditar = [];
    let importesFinales = {};

    if (distribuirAPrestadores) {
      if (distribucionPorMonto) {
        const totalMonto = Object.values(montosPrestadores).reduce((acc, curr) => acc + (parseFloat(curr) || 0), 0);
        if (totalMonto <= 0) {
          const confirmaSin = window.confirm(
            'Marcaste distribuir a prestadores pero no ingresaste montos a ningún profesional.\n\n¿Deseás registrar el cobro sin distribuir honorarios?'
          );
          if (!confirmaSin) return;
        } else if (totalMonto > (montoNum + 0.01)) {
          alert(`El total distribuido ($${totalMonto.toLocaleString('es-AR')}) supera el importe cobrado ($${montoNum.toLocaleString('es-AR')}). Por favor corregí los montos.`);
          return;
        } else {
          prestadoresAcreditar = prestadoresList.filter(p => (parseFloat(montosPrestadores[p.id_prestador]) || 0) > 0);
          prestadoresAcreditar.forEach(p => {
            importesFinales[p.id_prestador] = parseFloat(montosPrestadores[p.id_prestador]);
          });
        }
      } else {
        const totalSesiones = Object.values(sesionesPrestadores).reduce((acc, curr) => acc + (parseInt(curr) || 0), 0);
        if (totalSesiones <= 0) {
          const confirmaSin = window.confirm(
            'No asignaste sesiones a ningún prestador.\n\n¿Deseás registrar el cobro sin distribuir honorarios?'
          );
          if (!confirmaSin) return;
        } else {
          prestadoresAcreditar = prestadoresList.filter(p => (sesionesPrestadores[p.id_prestador] || 0) > 0);
          let sumaProvisoria = 0;
          prestadoresAcreditar.forEach(p => {
            const ses = sesionesPrestadores[p.id_prestador];
            let share = Math.round(((ses / totalSesiones) * montoNum) * 100) / 100;
            importesFinales[p.id_prestador] = share;
            sumaProvisoria += share;
          });
          // Ajuste de centavos por redondeo al primer prestador
          const diffRedondeo = Math.round((montoNum - sumaProvisoria) * 100) / 100;
          if (diffRedondeo !== 0 && prestadoresAcreditar.length > 0) {
            const primerId = prestadoresAcreditar[0].id_prestador;
            importesFinales[primerId] = Math.round((importesFinales[primerId] + diffRedondeo) * 100) / 100;
          }
        }
      }
    }

    try {
      setGuardandoCobro(true);

      // 1. Obtener nextIdPago unificado consultando las 3 tablas
      const { data: maxPagoMov } = await supabase
        .from('movimientoscuenta_motor')
        .select('id_pago')
        .not('id_pago', 'is', null)
        .order('id_pago', { ascending: false })
        .limit(1);

      const { data: maxPagoPrest } = await supabase
        .from('movprestadores_motor')
        .select('id_pago')
        .not('id_pago', 'is', null)
        .order('id_pago', { ascending: false })
        .limit(1);

      const { data: maxPagoMotor } = await supabase
        .from('pagos_motor')
        .select('id_pago')
        .not('id_pago', 'is', null)
        .order('id_pago', { ascending: false })
        .limit(1);

      const m1 = maxPagoMov?.[0]?.id_pago ? parseInt(maxPagoMov[0].id_pago) : 0;
      const m2 = maxPagoPrest?.[0]?.id_pago ? parseInt(maxPagoPrest[0].id_pago) : 0;
      const m3 = maxPagoMotor?.[0]?.id_pago ? parseInt(maxPagoMotor[0].id_pago) : 0;
      const nextIdPago = Math.max(m1, m2, m3) + 1;

      // 2. Obtener nextIdMovimiento para movimientoscuenta_motor
      const { data: ultMov, error: errUlt } = await supabase
        .from('movimientoscuenta_motor')
        .select('id_movimiento')
        .order('id_movimiento', { ascending: false })
        .limit(1);

      if (errUlt) throw errUlt;
      let nextIdMov = (ultMov && ultMov[0]?.id_movimiento ? ultMov[0].id_movimiento : 0) + 1;

      // 2b. Obtener nextIdDeuda para imputar en paciente
      const { data: maxDeudaData } = await supabase
        .from('movimientoscuenta_motor')
        .select('id_deuda')
        .not('id_deuda', 'is', null)
        .order('id_deuda', { ascending: false })
        .limit(1);
      const nextIdDeuda = (maxDeudaData?.[0]?.id_deuda ? parseInt(maxDeudaData[0].id_deuda) : 0) + 1;

      // 3. Resolver datos del paciente y acuerdo
      let pacienteId = null;
      let pacienteNombre = '';
      let idAcuerdoFinal = facturaSeleccionada?.id_acuerdo || acuerdoAFacturarCobrar?.id_acuerdo || null;
      let acuerdoNombre = facturaSeleccionada ? (facturaSeleccionada.concepto?.split(' - ')[0] || ('Factura #' + facturaSeleccionada.id_movimiento)) : (acuerdoAFacturarCobrar ? (acuerdoAFacturarCobrar.prestacion?.nombre_prestacion || 'Prestación O.S.') : `Cobro O.S. ${osNombre}`);
      let idMovFactura = facturaSeleccionada?.id_movimiento || null;

      if (acuerdoAFacturarCobrar) {
        pacienteId = acuerdoAFacturarCobrar.id_paciente;
        pacienteNombre = acuerdoAFacturarCobrar.paciente?.nombre_apellido || '';
        idAcuerdoFinal = acuerdoAFacturarCobrar.id_acuerdo;
      } else if (facturaSeleccionada) {
        // Intentar extraer de concepto
        const matchPac = facturaSeleccionada.concepto?.match(/Pac:\s*([^(]+)\s*\(ID\s*(\d+)\)/i);
        if (matchPac) {
          pacienteNombre = matchPac[1].trim();
          pacienteId = parseInt(matchPac[2]);
        }
        const matchPrest = facturaSeleccionada.concepto?.match(/Prestación:\s*([^-$]+)/i);
        if (matchPrest) {
          acuerdoNombre = matchPrest[1].trim();
        }

        // Si no se extrajo el id del concepto, buscar en acuerdos_motor
        if (!pacienteId && facturaSeleccionada.id_acuerdo) {
          const { data: acRow } = await supabase
            .from('acuerdos_motor')
            .select('id_paciente')
            .eq('id_acuerdo', facturaSeleccionada.id_acuerdo)
            .maybeSingle();
          if (acRow?.id_paciente) {
            pacienteId = acRow.id_paciente;
          }
        }
        if (pacienteId && !pacienteNombre) {
          const { data: pacRow } = await supabase
            .from('pacientes_motor')
            .select('nombre_apellido')
            .eq('id_paciente', pacienteId)
            .maybeSingle();
          if (pacRow) pacienteNombre = pacRow.nombre_apellido;
        }
      }

      // Si es Facturar y Cobrar en 1 Paso, crear primero la FACTURA_OS en movimientoscuenta_motor
      if (acuerdoAFacturarCobrar) {
        const nroFacGenerada = (formCobro.nroFactura || 'AGOSTO 2026').trim();
        const movFacOS = {
          id_movimiento: nextIdMov,
          id_paciente: 0,
          id_acuerdo: idAcuerdoFinal,
          id_deuda: null,
          fecha_cuota_origen: null,
          fecha_vencimiento: null,
          fecha_movimiento: formCobro.fecha || new Date().toISOString().split('T')[0],
          ciclo_mora: 0,
          escalon_mora: '0',
          tipo_movimiento: 'FACTURA_OS',
          subtipo: osNombre,
          id_origen: null,
          concepto: `Factura #${nroFacGenerada} - ${osNombre} - Pac: ${pacienteNombre} (ID ${pacienteId}) - Prestación: ${acuerdoNombre}`,
          debe: montoNum.toString(),
          haber: '0',
          saldo: '0',
          id_pago: null,
          usuario: usuario || 'Admin',
          fecha_registro: new Date().toISOString()
        };

        const { error: errFac } = await supabase.from('movimientoscuenta_motor').insert([movFacOS]);
        if (errFac) throw errFac;

        idMovFactura = nextIdMov;
        nextIdMov++;
      }

      const refFactura = facturaSeleccionada 
        ? ` (Cancela ${facturaSeleccionada.concepto?.split(' - ')[0] || ('Factura #' + facturaSeleccionada.id_movimiento)})` 
        : (acuerdoAFacturarCobrar ? ` (Factura #${formCobro.nroFactura || 'AGOSTO 2026'})` : '');

      const conceptoCobro = 'Cobro / Liquidación O.S. ' + osNombre + refFactura + ' - Comp: #' + (formCobro.nroComprobante || 'S/N') + ' (' + formCobro.formaPago + ')' + (formCobro.observaciones ? ' - ' + formCobro.observaciones : '');

      // 4. Insertar movimiento en cuenta de Obra Social (id_paciente: 0)
      const nuevoMovOS = {
        id_movimiento: nextIdMov,
        id_paciente: 0,
        id_acuerdo: idAcuerdoFinal,
        id_origen: idMovFactura,
        tipo_movimiento: 'PAGO_OS',
        subtipo: osNombre,
        concepto: conceptoCobro,
        debe: 0,
        haber: montoNum,
        saldo: 0,
        id_pago: nextIdPago,
        fecha_movimiento: formCobro.fecha || new Date().toISOString().split('T')[0],
        fecha_registro: new Date().toISOString(),
        usuario: usuario || 'Admin'
      };

      const { error: errInsertMov } = await supabase
        .from('movimientoscuenta_motor')
        .insert([nuevoMovOS]);

      if (errInsertMov) throw errInsertMov;
      nextIdMov++;

      // 4b. IMPACTO EN EL DEBE Y HABER DE LA CUENTA DEL PACIENTE
      if (pacienteId) {
        const fechaMov = formCobro.fecha || new Date().toISOString().split('T')[0];
        const cicloMora = parseInt(fechaMov.replace(/-/g, '').substring(0, 6), 10) || 0;
        const conceptoDebePac = `Prestación O.S. ${osNombre} - ${refFactura ? refFactura.replace(/^\s*\(/, '').replace(/\)$/, '') : acuerdoNombre}`;
        const conceptoHaberPac = `Pago / Cobertura O.S. ${osNombre} - Comp: #${formCobro.nroComprobante || 'S/N'}`;

        const movsPaciente = [
          {
            id_movimiento: nextIdMov,
            id_paciente: pacienteId,
            id_acuerdo: idAcuerdoFinal,
            id_deuda: nextIdDeuda,
            fecha_cuota_origen: fechaMov,
            fecha_vencimiento: null,
            fecha_movimiento: fechaMov,
            ciclo_mora: cicloMora,
            escalon_mora: '0',
            tipo_movimiento: 'cuota',
            subtipo: 'cobertura_os',
            id_origen: null,
            concepto: conceptoDebePac,
            debe: montoNum.toString(),
            haber: '0',
            saldo: '0',
            id_pago: null,
            usuario: usuario || 'Admin',
            fecha_registro: new Date().toISOString()
          },
          {
            id_movimiento: nextIdMov + 1,
            id_paciente: pacienteId,
            id_acuerdo: idAcuerdoFinal,
            id_deuda: nextIdDeuda,
            fecha_cuota_origen: fechaMov,
            fecha_vencimiento: fechaMov,
            fecha_movimiento: fechaMov,
            ciclo_mora: 0,
            escalon_mora: '0',
            tipo_movimiento: 'pago',
            subtipo: 'pago_os',
            id_origen: null,
            concepto: conceptoHaberPac,
            debe: '0',
            haber: montoNum.toString(),
            saldo: '0',
            id_pago: nextIdPago,
            usuario: usuario || 'Admin',
            fecha_registro: new Date().toISOString()
          }
        ];

        const { error: errPacMovs } = await supabase.from('movimientoscuenta_motor').insert(movsPaciente);
        if (errPacMovs) {
          console.warn('Aviso al registrar movimientos en paciente:', errPacMovs);
        }
      }

      // 5. Insertar distribución a prestadores en movprestadores_motor
      if (prestadoresAcreditar.length > 0) {
        const nuevosMovPrestadores = prestadoresAcreditar.map(p => ({
          id_prestador: p.id_prestador,
          id_paciente: pacienteId || null,
          fecha: formCobro.fecha || new Date().toISOString().split('T')[0],
          id_pago: nextIdPago,
          concepto: `Liquidación O.S. ${osNombre}${pacienteNombre ? ' - Pac: ' + pacienteNombre : ''}${refFactura}`,
          debe: '0',
          haber: (importesFinales[p.id_prestador] || 0).toString(),
          saldo: '0.00',
          usuario: usuario || 'Admin',
          acuerdo: acuerdoNombre
        }));

        const { error: errInsertPrest } = await supabase
          .from('movprestadores_motor')
          .insert(nuevosMovPrestadores);

        if (errInsertPrest) throw errInsertPrest;
      }

      // 6. Insertar en pagos_motor
      const nuevoRegistroPago = {
        id_pago: nextIdPago,
        id_cuota: null,
        id_paciente: pacienteId ? pacienteId.toString() : '0',
        fecha_pago: formCobro.fecha || new Date().toISOString().split('T')[0],
        importe: montoNum.toString().replace('.', ','),
        observacion: `Cobro Obra Social ${osNombre}${refFactura} | Comp: #${formCobro.nroComprobante || 'S/N'}${formCobro.observaciones ? ' - ' + formCobro.observaciones : ''}`,
        forma_pago: formCobro.formaPago.toUpperCase(),
        usuario: usuario || 'Admin',
        fecha_registro: new Date().toISOString(),
        id_acuerdo: idAcuerdoFinal,
        estado: 'ACTIVO'
      };

      const { error: errInsertPagoMotor } = await supabase
        .from('pagos_motor')
        .insert([nuevoRegistroPago]);

      if (errInsertPagoMotor) throw errInsertPagoMotor;

      // 7. Si es Transferencia o Depósito, registrar en bancos_motor
      if (formCobro.formaPago === 'TRANSFERENCIA BANCARIA' || formCobro.formaPago === 'DEPOSITO') {
        const registroBanco = {
          fecha: formCobro.fecha || new Date().toISOString().split('T')[0],
          usuario: usuario || 'Admin',
          banco: (formCobro.banco || 'GALICIA').toUpperCase(),
          tipo: 'INGRESO',
          concepto: `Cobro O.S. ${osNombre}${pacienteNombre ? ' - Pac: ' + pacienteNombre : ''}${refFactura}`,
          importe: montoNum,
          saldo: montoNum,
          id_pago: nextIdPago
        };
        const { error: errBanco } = await supabase.from('bancos_motor').insert([registroBanco]);
        if (errBanco) console.warn('Aviso banco:', errBanco);
      }

      // 8. Actualizar acuerdos_motor con el importe y estado
      if (idAcuerdoFinal) {
        await supabase
          .from('acuerdos_motor')
          .update({
            importe_actual: String(montoNum),
            observaciones: `Cobertura Obra Social: ${osNombre} [FACTURADO Y COBRADO O.S: $${montoNum.toLocaleString('es-AR')} - Pago #${nextIdPago}]`
          })
          .eq('id_acuerdo', idAcuerdoFinal);
      }

      setModalCobroAbierto(false);
      setFacturaSeleccionada(null);
      setAcuerdoAFacturarCobrar(null);
      setFormCobro({
        obraSocial: '',
        monto: '',
        nroComprobante: '',
        nroFactura: 'AGOSTO 2026',
        formaPago: 'TRANSFERENCIA BANCARIA',
        banco: 'GALICIA',
        fecha: new Date().toISOString().split('T')[0],
        observaciones: ''
      });

      const cantPrestDist = prestadoresAcreditar.length;
      setMensaje({
        texto: `✅ Cobro de $${montoNum.toLocaleString('es-AR')} registrado con éxito en ${osNombre} e impactado en la cuenta del paciente.${cantPrestDist > 0 ? ` Se acreditaron honorarios a ${cantPrestDist} prestador(es).` : ''}`,
        tipo: 'exito'
      });
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 5000);

      await cargarDatos();
      setTabActiva('libro');

    } catch (err) {
      console.error('Error al guardar cobro de O.S.:', err);
      alert('Error al guardar cobro: ' + err.message);
    } finally {
      setGuardandoCobro(false);
    }
  };

  // Handler para Facturar Acuerdo de O.S. (a Cobrar en diferido)
  const guardarFacturaOS = async (e) => {
    e.preventDefault();
    if (!acuerdoAFacturar) return;

    const montoNum = parsearMoneda(formFactura.monto);
    if (!montoNum || montoNum <= 0) {
      alert('Por favor, ingresá un importe válido mayor a 0.');
      return;
    }
    const nroFac = (formFactura.nroFactura || '').trim();
    if (!nroFac) {
      alert('Por favor, ingresá el número de factura o período (ej: AGOSTO 2026).');
      return;
    }

    try {
      setGuardandoFactura(true);

      // Obtener nextIdMovimiento
      const { data: ultMov, error: errUlt } = await supabase
        .from('movimientoscuenta_motor')
        .select('id_movimiento')
        .order('id_movimiento', { ascending: false })
        .limit(1);
      if (errUlt) throw errUlt;
      const nextIdMov = (ultMov && ultMov[0]?.id_movimiento ? ultMov[0].id_movimiento : 0) + 1;

      const ac = acuerdoAFacturar;
      const osNombre = ac.obraSocialNombre || 'OBRA SOCIAL';
      const pacNombre = ac.paciente?.nombre_apellido || `ID ${ac.id_paciente}`;
      const prestNombre = ac.prestacion?.nombre_prestacion || `Prestación #${ac.id_prestacion}`;

      const nuevoMovFactura = {
        id_movimiento: nextIdMov,
        id_paciente: 0,
        id_acuerdo: ac.id_acuerdo,
        id_deuda: null,
        fecha_cuota_origen: null,
        fecha_vencimiento: null,
        fecha_movimiento: formFactura.fecha || new Date().toISOString().split('T')[0],
        ciclo_mora: 0,
        escalon_mora: '0',
        tipo_movimiento: 'FACTURA_OS',
        subtipo: osNombre,
        id_origen: null,
        concepto: `Factura #${nroFac} - ${osNombre} - Pac: ${pacNombre} (ID ${ac.id_paciente}) - Prestación: ${prestNombre}`,
        debe: montoNum.toString(),
        haber: '0',
        saldo: '0',
        id_pago: null,
        usuario: usuario || 'Admin',
        fecha_registro: new Date().toISOString()
      };

      const { error: errInsert } = await supabase
        .from('movimientoscuenta_motor')
        .insert([nuevoMovFactura]);
      if (errInsert) throw errInsert;

      // Actualizar acuerdos_motor con el importe asignado
      const obsFacturado = `Cobertura Obra Social: ${osNombre} [FACTURADO O.S: $${montoNum.toLocaleString('es-AR')} - Factura: ${nroFac} - O.S: ${osNombre} - Fecha: ${formFactura.fecha}]`;
      await supabase
        .from('acuerdos_motor')
        .update({
          importe_actual: String(montoNum),
          observaciones: obsFacturado
        })
        .eq('id_acuerdo', ac.id_acuerdo);

      setModalFacturarAbierto(false);
      setAcuerdoAFacturar(null);
      setMensaje({
        texto: `✅ Factura #${nroFac} por $${montoNum.toLocaleString('es-AR')} emitida a ${osNombre}. Se ha incorporado al Libro Mayor como pendiente de cobro.`,
        tipo: 'exito'
      });
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 5000);

      await cargarDatos();
      setTabActiva('libro');
    } catch (err) {
      console.error('Error al facturar acuerdo:', err);
      alert('Error al facturar: ' + err.message);
    } finally {
      setGuardandoFactura(false);
    }
  };

  // Handler para abrir modal de edición de factura emitida
  const abrirEditarFactura = (mov) => {
    setFacturaAEditar(mov);
    let nro = '';
    const matchNro = (mov.concepto || '').match(/Factura\s*#?([^-]+)/i);
    if (matchNro && matchNro[1]) {
      nro = matchNro[1].trim();
    } else {
      nro = 'AGOSTO 2026';
    }

    setFormEditarFactura({
      nroFactura: nro,
      monto: String(parsearMoneda(mov.debe) || ''),
      fecha: mov.fecha_movimiento || (mov.fecha_registro ? mov.fecha_registro.split('T')[0] : new Date().toISOString().split('T')[0]),
      observaciones: ''
    });
    setModalEditarFacturaAbierto(true);
  };

  // Handler para guardar cambios de la factura emitida
  const guardarEdicionFactura = async (e) => {
    e.preventDefault();
    if (!facturaAEditar) return;

    const montoNum = parsearMoneda(formEditarFactura.monto);
    if (!montoNum || montoNum <= 0) {
      alert('Por favor, ingresá un importe válido y mayor a 0.');
      return;
    }
    const nroFac = (formEditarFactura.nroFactura || '').trim();
    if (!nroFac) {
      alert('Por favor, ingresá el número de factura o período.');
      return;
    }

    const infoFac = facturasMapeadas[facturaAEditar.id_movimiento];
    if (infoFac && infoFac.totalCobrado > (montoNum + 0.01)) {
      alert(`El nuevo importe ($${montoNum.toLocaleString('es-AR')}) no puede ser menor a lo que ya fue cobrado ($${infoFac.totalCobrado.toLocaleString('es-AR')}).`);
      return;
    }

    try {
      setGuardandoEdicion(true);

      let nuevoConcepto = facturaAEditar.concepto || '';
      if (nuevoConcepto.includes(' - ')) {
        const partes = nuevoConcepto.split(' - ');
        partes[0] = `Factura #${nroFac}`;
        nuevoConcepto = partes.join(' - ');
      } else {
        nuevoConcepto = `Factura #${nroFac} - ${facturaAEditar.subtipo}`;
      }

      // 1. Actualizar movimientoscuenta_motor
      const { error: errMov } = await supabase
        .from('movimientoscuenta_motor')
        .update({
          debe: montoNum.toString(),
          fecha_movimiento: formEditarFactura.fecha,
          concepto: nuevoConcepto
        })
        .eq('id_movimiento', facturaAEditar.id_movimiento);

      if (errMov) throw errMov;

      // 2. Si tiene id_acuerdo, actualizar acuerdos_motor
      if (facturaAEditar.id_acuerdo) {
        const obsFacturado = `Cobertura Obra Social: ${facturaAEditar.subtipo} [FACTURADO O.S: $${montoNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })} - Factura: ${nroFac} - O.S: ${facturaAEditar.subtipo} - Fecha: ${formEditarFactura.fecha}]`;
        await supabase
          .from('acuerdos_motor')
          .update({
            importe_actual: String(montoNum),
            observaciones: obsFacturado
          })
          .eq('id_acuerdo', facturaAEditar.id_acuerdo);
      }

      setMensaje({
        texto: `✅ Factura #${nroFac} actualizada correctamente ($${montoNum.toLocaleString('es-AR')}).`,
        tipo: 'exito'
      });
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);

      setModalEditarFacturaAbierto(false);
      setFacturaAEditar(null);
      await cargarDatos();

    } catch (err) {
      console.error('Error al editar factura:', err);
      alert('Error al guardar cambios de la factura: ' + err.message);
    } finally {
      setGuardandoEdicion(false);
    }
  };

  // Handler para abrir modal de Facturar y Cobrar en 1 Paso
  const abrirFacturarYCobrar = (acuerdo) => {
    setAcuerdoAFacturarCobrar(acuerdo);
    setFacturaSeleccionada(null);

    // Inicializar montos y sesiones de prestadores
    const montosZero = {};
    const sesZero = {};
    prestadoresList.forEach(p => {
      montosZero[p.id_prestador] = '';
      sesZero[p.id_prestador] = 0;
    });
    setMontosPrestadores(montosZero);
    setSesionesPrestadores(sesZero);
    setDistribuirAPrestadores(true);
    setDistribucionPorMonto(false);

    const osDefault = acuerdo.obraSocialNombre || '';
    const importeSugerido = parsearMoneda(acuerdo.importe_actual) > 0 ? String(parsearMoneda(acuerdo.importe_actual)) : '';

    setFormCobro({
      obraSocial: osDefault,
      monto: importeSugerido,
      nroComprobante: '',
      nroFactura: 'AGOSTO 2026',
      formaPago: 'TRANSFERENCIA BANCARIA',
      banco: 'GALICIA',
      fecha: new Date().toISOString().split('T')[0],
      observaciones: `Facturación y Cobro O.S. - Pac: ${acuerdo.paciente?.nombre_apellido || acuerdo.id_paciente}`
    });

    autocompletarSesionesFactura({ id_acuerdo: acuerdo.id_acuerdo, id_paciente: acuerdo.id_paciente }, prestadoresList);
    setModalCobroAbierto(true);
  };

  // Handler para anular movimiento de obra social
  const anularMovimientoOS = async (mov) => {
    const confirmar = window.confirm(
      '¿Está seguro de que desea eliminar este registro de la cuenta corriente de ' + mov.subtipo + '?' +
      '\n\n• Concepto: ' + mov.concepto +
      '\n• Importe: $' + (parsearMoneda(mov.debe) || parsearMoneda(mov.haber)).toLocaleString('es-AR') +
      '\n\nEsta acción modificará el saldo consolidado de la Obra Social' + (mov.id_pago ? ' y revertirá las liquidaciones asociadas a prestadores y movimientos del paciente.' : '.')
    );

    if (!confirmar) return;

    try {
      if (mov.id_pago) {
        await supabase.from('movprestadores_motor').delete().eq('id_pago', mov.id_pago);
        await supabase.from('pagos_motor').delete().eq('id_pago', mov.id_pago);
        await supabase.from('bancos_motor').delete().eq('id_pago', mov.id_pago);
        await supabase.from('movimientoscuenta_motor').delete().eq('id_pago', mov.id_pago);
      }

      if (mov.id_acuerdo) {
        const { data: acActual } = await supabase
          .from('acuerdos_motor')
          .select('observaciones')
          .eq('id_acuerdo', mov.id_acuerdo)
          .maybeSingle();
        let obsLimpia = (acActual?.observaciones || '').replace(/\s*\[FACTURADO[^\]]*\]/gi, '').trim();
        await supabase
          .from('acuerdos_motor')
          .update({
            importe_actual: '0,00',
            observaciones: obsLimpia || null
          })
          .eq('id_acuerdo', mov.id_acuerdo);
      }

      const { error } = await supabase
        .from('movimientoscuenta_motor')
        .delete()
        .eq('id_movimiento', mov.id_movimiento);

      if (error) throw error;

      setMensaje({ texto: 'Registro #' + mov.id_movimiento + ' eliminado exitosamente.', tipo: 'exito' });
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 3500);

      await cargarDatos();
    } catch (err) {
      console.error('Error al anular movimiento:', err);
      alert('Error al anular: ' + err.message);
    }
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* ENCABEZADO */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', background: '#fff', padding: '16px 20px', borderRadius: '10px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #e2e8f0' }}>
        <div>
          <h2 style={{ margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '22px' }}>
            🏛️ Cuentas Corrientes de Obras Sociales
          </h2>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
            Control de facturación emitida, cobranzas recibidas y saldos pendientes a cobrar por cada Obra Social.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => abrirModalCobro()}
            style={{
              background: '#059669',
              color: '#fff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
            }}
          >
            ➕ Registrar Cobro de O.S.
          </button>

          {onVolver && (
            <button
              onClick={onVolver}
              style={{
                background: '#f1f5f9',
                color: '#334155',
                border: '1px solid #cbd5e1',
                padding: '10px 16px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              ← Volver al Menú
            </button>
          )}
        </div>
      </div>

      {/* TOAST MENSAJE */}
      {mensaje.texto && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontWeight: 'bold',
          fontSize: '14px',
          border: '1px solid ' + (mensaje.tipo === 'error' ? '#fca5a5' : '#86efac')
        }}>
          {mensaje.texto}
        </div>
      )}

      {/* SELECTOR DE PESTAÑAS */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '10px' }}>
        <button
          type="button"
          onClick={() => setTabActiva('libro')}
          style={{
            background: tabActiva === 'libro' ? '#2563eb' : '#fff',
            color: tabActiva === 'libro' ? '#fff' : '#475569',
            border: `1px solid ${tabActiva === 'libro' ? '#2563eb' : '#cbd5e1'}`,
            padding: '10px 20px',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: tabActiva === 'libro' ? '0 2px 4px rgba(37,99,235,0.2)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <span>📑 Libro Mayor y Cobranzas</span>
          <span style={{
            background: tabActiva === 'libro' ? 'rgba(255,255,255,0.25)' : '#e2e8f0',
            color: tabActiva === 'libro' ? '#fff' : '#334155',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 'bold'
          }}>
            {movimientosFiltrados.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTabActiva('pendientes')}
          style={{
            background: tabActiva === 'pendientes' ? '#d97706' : '#fff',
            color: tabActiva === 'pendientes' ? '#fff' : '#92400e',
            border: `1px solid ${tabActiva === 'pendientes' ? '#d97706' : '#fde68a'}`,
            padding: '10px 20px',
            borderRadius: '8px',
            fontWeight: 'bold',
            fontSize: '14px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: tabActiva === 'pendientes' ? '0 2px 4px rgba(217,119,6,0.25)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <span>⏳ Acuerdos Pendientes de Facturar</span>
          <span style={{
            background: tabActiva === 'pendientes' ? 'rgba(255,255,255,0.3)' : (acuerdosOSPendientes.length > 0 ? '#ef4444' : '#10b981'),
            color: '#fff',
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: 'bold'
          }}>
            {acuerdosOSPendientes.length}
          </span>
        </button>
      </div>

      {tabActiva === 'libro' && (
        <>
          {/* TARJETAS KPI */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px', marginBottom: '20px' }}>
        
        <div 
          onClick={() => setFiltroTipo('FACTURAS')}
          style={{ 
            background: '#fff', 
            padding: '18px', 
            borderRadius: '10px', 
            border: filtroTipo === 'FACTURAS' ? '2px solid #2563eb' : '1px solid #e2e8f0', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          title="Click para ver solo Facturas Emitidas"
        >
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
            💼 Total Facturado a O.S. (Debe)
          </span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#2563eb', marginTop: '6px' }}>
            {'$' + totales.totalDebe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Facturas emitidas a cobrar (Click para filtrar)</span>
        </div>

        <div 
          onClick={() => setFiltroTipo('COBROS')}
          style={{ 
            background: '#fff', 
            padding: '18px', 
            borderRadius: '10px', 
            border: filtroTipo === 'COBROS' ? '2px solid #16a34a' : '1px solid #e2e8f0', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          title="Click para ver solo Cobros Recibidos"
        >
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
            💵 Total Cobrado / Liquidado (Haber)
          </span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#16a34a', marginTop: '6px' }}>
            {'$' + totales.totalHaber.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Cobranzas y transferencias ingresadas (Click para filtrar)</span>
        </div>

        <div 
          onClick={() => setFiltroTipo('PENDIENTES')}
          style={{ 
            background: totales.saldoPendiente > 0 ? '#fffbeb' : '#f0fdf4', 
            padding: '18px', 
            borderRadius: '10px', 
            border: filtroTipo === 'PENDIENTES' ? '2px solid #d97706' : ('1px solid ' + (totales.saldoPendiente > 0 ? '#fde047' : '#bbf7d0')), 
            boxShadow: '0 2px 4px rgba(217,119,6,0.15)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          title="Click para ver SOLO facturas pendientes de cobro"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 'bold', color: totales.saldoPendiente > 0 ? '#854d0e' : '#166534', textTransform: 'uppercase' }}>
              ⏳ Saldo a Cobrar de O.S.
            </span>
            <span style={{
              background: '#d97706',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 'bold',
              padding: '2px 7px',
              borderRadius: '8px'
            }}>
              {facturasPendientes.length} pend.
            </span>
          </div>
          <div style={{ fontSize: '24px', fontWeight: '800', color: totales.saldoPendiente > 0 ? '#d97706' : '#15803d', marginTop: '6px' }}>
            {'$' + totales.saldoPendiente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: totales.saldoPendiente > 0 ? '#b45309' : '#166534' }}>
            {totales.saldoPendiente > 0 ? '👉 Click aquí para filtrar solo pendientes' : 'Cuentas al día'}
          </span>
        </div>

        <div 
          onClick={() => setFiltroTipo('TODOS')}
          style={{ 
            background: '#fff', 
            padding: '18px', 
            borderRadius: '10px', 
            border: filtroTipo === 'TODOS' ? '2px solid #475569' : '1px solid #e2e8f0', 
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          title="Click para ver todos los movimientos"
        >
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
            📋 Registros Listados
          </span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#475569', marginTop: '6px' }}>
            {movimientosFiltrados.length}
          </div>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Filtrados según selección (Click para resetear)</span>
        </div>

      </div>

      {/* BARRA DE FILTROS */}
      <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '10px', marginBottom: '15px', border: '1px solid #e2e8f0', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
        
        <div style={{ minWidth: '240px', flex: 1 }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
            Seleccionar Obra Social:
          </label>
          <select
            value={obraSocialSeleccionada}
            onChange={(e) => setObraSocialSeleccionada(e.target.value)}
            style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 'bold', background: '#fff' }}
          >
            <option value="TODAS">-- TODAS LAS OBRAS SOCIALES --</option>
            {obrasSocialesLista.map(os => (
              <option key={os} value={os}>{os}</option>
            ))}
          </select>
        </div>

        <div style={{ minWidth: '220px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
            Tipo / Estado de Movimiento:
          </label>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff', fontWeight: '600' }}
          >
            <option value="TODOS">📋 Todos los movimientos</option>
            <option value="PENDIENTES">⏳ Facturas Pendientes de Cobro ({facturasPendientes.length})</option>
            <option value="COBRADAS">✅ Facturas Cobradas / Saldadas ({facturasSaldadas.length})</option>
            <option value="FACTURAS">📄 Todas las Facturas Emitidas (Debe)</option>
            <option value="COBROS">💵 Solo Cobros Recibidos (Haber)</option>
          </select>
        </div>

        <div style={{ minWidth: '260px', flex: 2 }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
            Buscar por concepto, paciente o comprobante:
          </label>
          <input
            type="text"
            placeholder="Ej: Pérez, Factura #1234, etc..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
          />
        </div>

        {obraSocialSeleccionada !== 'TODAS' && (
          <button
            onClick={() => setObraSocialSeleccionada('TODAS')}
            style={{ marginTop: '18px', background: '#e2e8f0', border: 'none', padding: '9px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', color: '#475569' }}
          >
            ✕ Ver Todas
          </button>
        )}

      </div>

      {/* BOTONES RÁPIDOS DE FILTRADO POR ESTADO */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <button
          type="button"
          onClick={() => setFiltroTipo('TODOS')}
          style={{
            padding: '7px 14px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            border: filtroTipo === 'TODOS' ? '2px solid #2563eb' : '1px solid #cbd5e1',
            background: filtroTipo === 'TODOS' ? '#eff6ff' : '#fff',
            color: filtroTipo === 'TODOS' ? '#1d4ed8' : '#64748b',
            boxShadow: filtroTipo === 'TODOS' ? '0 1px 3px rgba(37,99,235,0.2)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          📋 Todos ({movimientos.length})
        </button>

        <button
          type="button"
          onClick={() => setFiltroTipo('PENDIENTES')}
          style={{
            padding: '7px 14px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            border: filtroTipo === 'PENDIENTES' ? '2px solid #d97706' : '1px solid #fed7aa',
            background: filtroTipo === 'PENDIENTES' ? '#fef3c7' : '#fffbeb',
            color: filtroTipo === 'PENDIENTES' ? '#92400e' : '#b45309',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: filtroTipo === 'PENDIENTES' ? '0 2px 4px rgba(217,119,6,0.25)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <span>⏳ Facturas Pendientes de Cobro</span>
          <span style={{
            background: facturasPendientes.length > 0 ? '#d97706' : '#10b981',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: 'bold'
          }}>
            {facturasPendientes.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFiltroTipo('COBRADAS')}
          style={{
            padding: '7px 14px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            border: filtroTipo === 'COBRADAS' ? '2px solid #16a34a' : '1px solid #bbf7d0',
            background: filtroTipo === 'COBRADAS' ? '#dcfce7' : '#f0fdf4',
            color: filtroTipo === 'COBRADAS' ? '#15803d' : '#166534',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: filtroTipo === 'COBRADAS' ? '0 1px 3px rgba(22,163,74,0.2)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <span>✅ Facturas Cobradas / Saldadas</span>
          <span style={{
            background: '#16a34a',
            color: '#fff',
            padding: '2px 8px',
            borderRadius: '10px',
            fontSize: '11px',
            fontWeight: 'bold'
          }}>
            {facturasSaldadas.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFiltroTipo('FACTURAS')}
          style={{
            padding: '7px 14px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            border: filtroTipo === 'FACTURAS' ? '2px solid #2563eb' : '1px solid #cbd5e1',
            background: filtroTipo === 'FACTURAS' ? '#eff6ff' : '#fff',
            color: filtroTipo === 'FACTURAS' ? '#1d4ed8' : '#64748b',
            transition: 'all 0.15s ease'
          }}
        >
          📄 Todas las Facturas ({Object.keys(facturasMapeadas).length})
        </button>

        <button
          type="button"
          onClick={() => setFiltroTipo('COBROS')}
          style={{
            padding: '7px 14px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            border: filtroTipo === 'COBROS' ? '2px solid #059669' : '1px solid #cbd5e1',
            background: filtroTipo === 'COBROS' ? '#ecfdf5' : '#fff',
            color: filtroTipo === 'COBROS' ? '#047857' : '#64748b',
            transition: 'all 0.15s ease'
          }}
        >
          💵 Solo Cobros Recibidos ({movimientos.filter(m => m.tipo_movimiento === 'PAGO_OS' || parsearMoneda(m.haber) > 0).length})
        </button>
      </div>

      {/* TABLA DE MOVIMIENTOS */}
      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, color: '#1e293b', fontSize: '15px' }}>
            Libro de Movimientos de Cuenta Corriente ({obraSocialSeleccionada})
            {filtroTipo === 'PENDIENTES' && <span style={{ marginLeft: '10px', color: '#d97706', fontSize: '13px', fontWeight: 'bold' }}>• ⏳ Solo Facturas Pendientes</span>}
            {filtroTipo === 'COBRADAS' && <span style={{ marginLeft: '10px', color: '#16a34a', fontSize: '13px', fontWeight: 'bold' }}>• ✅ Solo Facturas Saldadas</span>}
            {filtroTipo === 'FACTURAS' && <span style={{ marginLeft: '10px', color: '#2563eb', fontSize: '13px', fontWeight: 'bold' }}>• 📄 Solo Facturas Emitidas</span>}
            {filtroTipo === 'COBROS' && <span style={{ marginLeft: '10px', color: '#059669', fontSize: '13px', fontWeight: 'bold' }}>• 💵 Solo Cobros</span>}
          </h4>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            {movimientosFiltrados.length} fila(s) encontradas
          </span>
        </div>

        {cargando ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
            Cargando movimientos de obras sociales...
          </div>
        ) : movimientosFiltrados.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
            No se registran movimientos para el criterio seleccionado.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '1px solid #cbd5e1' }}>
                  <th style={{ padding: '12px 14px' }}>Fecha</th>
                  <th style={{ padding: '12px 14px' }}>Obra Social</th>
                  <th style={{ padding: '12px 14px' }}>Tipo / Estado</th>
                  <th style={{ padding: '12px 14px' }}>Detalle / Concepto</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Facturado (Debe)</th>
                  <th style={{ padding: '12px 14px', textAlign: 'right' }}>Cobrado (Haber)</th>
                  <th style={{ padding: '12px 14px' }}>Usuario</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {movimientosFiltrados.map((m) => {
                  const debeVal = parsearMoneda(m.debe);
                  const haberVal = parsearMoneda(m.haber);
                  const esFactura = m.tipo_movimiento === 'FACTURA_OS' || debeVal > 0;
                  const infoFac = facturasMapeadas[m.id_movimiento];

                  return (
                    <tr key={m.id_movimiento} style={{ borderBottom: '1px solid #f1f5f9', background: esFactura && infoFac && !infoFac.estaSaldada ? '#fffdf7' : 'transparent' }}>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontWeight: '500', color: '#334155' }}>
                        {m.fecha_movimiento || (m.fecha_registro ? m.fecha_registro.split('T')[0] : 'S/D')}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#0f172a' }}>
                        {m.subtipo || 'OBRA SOCIAL'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            background: esFactura ? (infoFac?.estaSaldada ? '#f1f5f9' : '#dbeafe') : '#dcfce7',
                            color: esFactura ? (infoFac?.estaSaldada ? '#475569' : '#1e40af') : '#15803d'
                          }}>
                            {esFactura ? '📄 FACTURA' : '💵 COBRO'}
                          </span>
                          {esFactura && (
                            <span style={{
                              fontSize: '10px',
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontWeight: '700',
                              background: infoFac?.estaSaldada ? '#dcfce7' : (infoFac?.esParcial ? '#fef3c7' : '#fee2e2'),
                              color: infoFac?.estaSaldada ? '#15803d' : (infoFac?.esParcial ? '#b45309' : '#b91c1c')
                            }}>
                              {infoFac?.estaSaldada 
                                ? '✅ SALDADA' 
                                : (infoFac?.esParcial 
                                    ? `🟡 PARCIAL (Resta $${infoFac.saldoPendiente.toLocaleString('es-AR', { minimumFractionDigits: 2 })})` 
                                    : `⏳ PENDIENTE ($${(infoFac?.saldoPendiente || debeVal).toLocaleString('es-AR', { minimumFractionDigits: 2 })})`)}
                            </span>
                          )}
                          {!esFactura && m.id_pago && (
                            <span style={{
                              fontSize: '10px',
                              background: '#f1f5f9',
                              color: '#475569',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontWeight: '600'
                            }} title={`Pago correlativo #${m.id_pago} (con distribución de honorarios)`}>
                              Pago #{m.id_pago}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#334155' }}>
                        {m.concepto || 'Sin concepto'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 'bold', color: debeVal > 0 ? '#2563eb' : '#94a3b8' }}>
                        {debeVal > 0 ? ('$' + debeVal.toLocaleString('es-AR', { minimumFractionDigits: 2 })) : '-'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 'bold', color: haberVal > 0 ? '#16a34a' : '#94a3b8' }}>
                        {haberVal > 0 ? ('$' + haberVal.toLocaleString('es-AR', { minimumFractionDigits: 2 })) : '-'}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '12px' }}>
                        {m.usuario || 'Admin'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {esFactura && (
                          infoFac?.estaSaldada ? (
                            <span style={{
                              background: '#f0fdf4',
                              color: '#16a34a',
                              border: '1px solid #bbf7d0',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              marginRight: '6px'
                            }} title="Factura cancelada al 100%">
                              ✅ Cobrada
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                const facPend = infoFac || {
                                  ...m,
                                  montoFactura: parsearMoneda(m.debe),
                                  saldoPendiente: parsearMoneda(m.debe)
                                };
                                abrirModalCobro(facPend);
                              }}
                              title="Registrar cobro para esta factura pendiente"
                              style={{
                                background: '#ecfdf5',
                                color: '#059669',
                                border: '1px solid #a7f3d0',
                                padding: '5px 12px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                marginRight: '6px',
                                boxShadow: '0 1px 2px rgba(5,150,105,0.2)',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseOver={(e) => { e.currentTarget.style.background = '#059669'; e.currentTarget.style.color = '#fff'; }}
                              onMouseOut={(e) => { e.currentTarget.style.background = '#ecfdf5'; e.currentTarget.style.color = '#059669'; }}
                            >
                              💵 Cobrar {infoFac?.saldoPendiente ? `($${infoFac.saldoPendiente.toLocaleString('es-AR')})` : ''}
                            </button>
                          )
                        )}
                        {esFactura && (
                          <button
                            type="button"
                            onClick={() => abrirEditarFactura(m)}
                            title="Editar número de factura, importe o fecha de emisión"
                            style={{
                              background: '#eff6ff',
                              color: '#2563eb',
                              border: '1px solid #bfdbfe',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              marginRight: '6px',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.background = '#2563eb'; e.currentTarget.style.color = '#fff'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.color = '#2563eb'; }}
                          >
                            ✏️
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => anularMovimientoOS(m)}
                          title="Eliminar este movimiento de la cuenta de la obra social"
                          style={{
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: '1px solid #fca5a5',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: 'pointer'
                          }}
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
      </>
      )}

      {/* VISTA DE ACUERDOS DE OBRA SOCIAL */}
      {tabActiva === 'pendientes' && (
        <div>
          {/* TARJETAS RESUMEN DE ACUERDOS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px', marginBottom: '20px' }}>
            <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
                ⏳ Acuerdos Pendientes de Facturar
              </span>
              <div style={{ fontSize: '26px', fontWeight: '800', color: acuerdosOSPendientes.length > 0 ? '#d97706' : '#16a34a', marginTop: '6px' }}>
                {acuerdosOSPendientes.length}
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Requieren emitir factura a la entidad</span>
            </div>

            <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
                ✅ Acuerdos ya Facturados / Cobrados
              </span>
              <div style={{ fontSize: '26px', fontWeight: '800', color: '#2563eb', marginTop: '6px' }}>
                {acuerdosOS.filter(a => a.estaFacturado).length}
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>En libro mayor de O.S.</span>
            </div>

            <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
                📋 Total Acuerdos de Obra Social
              </span>
              <div style={{ fontSize: '26px', fontWeight: '800', color: '#334155', marginTop: '6px' }}>
                {acuerdosOS.length}
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Registrados en el centro médico</span>
            </div>
          </div>

          {/* BARRA DE FILTROS DE ACUERDOS */}
          <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ minWidth: '220px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                Estado:
              </label>
              <select
                value={filtroEstadoAcuerdos}
                onChange={(e) => setFiltroEstadoAcuerdos(e.target.value)}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff', fontWeight: 'bold' }}
              >
                <option value="PENDIENTES">⏳ Solo Pendientes de Facturar ({acuerdosOSPendientes.length})</option>
                <option value="TODOS">📋 Todos los Acuerdos de O.S. ({acuerdosOS.length})</option>
                <option value="FACTURADOS">✅ Solo Ya Facturados ({acuerdosOS.filter(a => a.estaFacturado).length})</option>
              </select>
            </div>

            <div style={{ minWidth: '220px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                Filtrar por Obra Social:
              </label>
              <select
                value={filtroOSAcuerdos}
                onChange={(e) => setFiltroOSAcuerdos(e.target.value)}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff' }}
              >
                <option value="TODAS">-- TODAS LAS OBRAS SOCIALES --</option>
                {obrasSocialesLista.map(os => (
                  <option key={os} value={os}>{os}</option>
                ))}
              </select>
            </div>

            <div style={{ minWidth: '260px', flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                Buscar paciente o prestación:
              </label>
              <input
                type="text"
                placeholder="Ej: Pérez, 40123456, CETINNE..."
                value={busquedaPendientes}
                onChange={(e) => setBusquedaPendientes(e.target.value)}
                style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
              />
            </div>
          </div>

          {/* TABLA DE ACUERDOS */}
          <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0, color: '#1e293b', fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{filtroEstadoAcuerdos === 'PENDIENTES' ? '⏳ Acuerdos Pendientes de Facturación' : '📋 Listado de Acuerdos de O.S.'}</span>
              </h4>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {acuerdosOSPendientesFiltrados.length} fila(s) encontradas
              </span>
            </div>

            {cargando ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                Cargando acuerdos de obras sociales...
              </div>
            ) : acuerdosOSPendientesFiltrados.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                {filtroEstadoAcuerdos === 'PENDIENTES'
                  ? '🎉 ¡No hay acuerdos de Obra Social pendientes de facturar para el filtro seleccionado!'
                  : 'No se encontraron acuerdos con los criterios seleccionados.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '1px solid #cbd5e1' }}>
                      <th style={{ padding: '12px 14px' }}>Fecha</th>
                      <th style={{ padding: '12px 14px' }}>Paciente</th>
                      <th style={{ padding: '12px 14px' }}>Obra Social</th>
                      <th style={{ padding: '12px 14px' }}>Prestación</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center' }}>Estado</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}>Importe ($)</th>
                      <th style={{ padding: '12px 14px', textAlign: 'center' }}>Acciones para Facturar / Cobrar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acuerdosOSPendientesFiltrados.map((ac) => {
                      const yaFacturado = ac.estaFacturado;
                      const imp = parsearMoneda(ac.importe_actual);

                      return (
                        <tr key={ac.id_acuerdo} style={{ borderBottom: '1px solid #f1f5f9', background: yaFacturado ? '#fafafa' : '#fff' }}>
                          <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', color: '#334155' }}>
                            {ac.fecha_acuerdo || (ac.fecha_registro ? ac.fecha_registro.split('T')[0] : 'S/D')}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 'bold', color: '#0f172a' }}>
                              {ac.paciente?.nombre_apellido || `Paciente ID ${ac.id_paciente}`}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>
                              DNI: {ac.paciente?.dni || 'S/D'} • ID: {ac.id_paciente}
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ fontWeight: 'bold', color: '#1e40af', background: '#dbeafe', padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                              🏛️ {ac.obraSocialNombre}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', color: '#334155', fontWeight: '500' }}>
                            {ac.prestacion?.nombre_prestacion || `Prestación ID ${ac.id_prestacion}`}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                            {yaFacturado ? (
                              <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', background: '#dcfce7', color: '#15803d' }}>
                                ✅ Facturado
                              </span>
                            ) : (
                              <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', background: '#fef3c7', color: '#92400e' }}>
                                ⏳ Pendiente
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 'bold', color: imp > 0 ? '#0f172a' : '#94a3b8' }}>
                            {imp > 0 ? ('$' + imp.toLocaleString('es-AR', { minimumFractionDigits: 2 })) : '$ 0,00'}
                          </td>
                          <td style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {yaFacturado ? (
                              <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 'bold' }}>
                                  Factura en Libro Mayor
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setTabActiva('libro')}
                                  style={{
                                    background: '#eff6ff',
                                    color: '#2563eb',
                                    border: '1px solid #bfdbfe',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Ver en Libro ↗
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAcuerdoAFacturar(ac);
                                    setFormFactura({
                                      nroFactura: 'AGOSTO 2026',
                                      monto: imp > 0 ? String(imp) : '',
                                      fecha: new Date().toISOString().split('T')[0]
                                    });
                                    setModalFacturarAbierto(true);
                                  }}
                                  style={{
                                    background: '#eff6ff',
                                    color: '#2563eb',
                                    border: '1px solid #93c5fd',
                                    padding: '5px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                  }}
                                  title="Ingresar N° factura e importe para que quede pendiente de cobro en el Libro Mayor"
                                >
                                  📄 Facturar (a Cobrar)
                                </button>

                                <button
                                  type="button"
                                  onClick={() => abrirFacturarYCobrar(ac)}
                                  style={{
                                    background: '#ecfdf5',
                                    color: '#059669',
                                    border: '1px solid #a7f3d0',
                                    padding: '5px 12px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                  }}
                                  title="Facturar, cobrar y liquidar a prestadores en 1 solo paso"
                                >
                                  ⚡ Facturar y Cobrar
                                </button>
                              </div>
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

      {/* MODAL FACTURAR ACUERDO DE O.S. (A COBRAR) */}
      {modalFacturarAbierto && acuerdoAFacturar && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            maxWidth: '520px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📄 Facturar Acuerdo a Obra Social
                </h3>
                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Emite la factura a cobrar y la incorpora a la cuenta corriente de la entidad.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setModalFacturarAbierto(false); setAcuerdoAFacturar(null); }}
                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px', fontSize: '13px' }}>
              <div style={{ marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Paciente: </span>
                <strong style={{ color: '#0f172a' }}>{acuerdoAFacturar.paciente?.nombre_apellido || `ID ${acuerdoAFacturar.id_paciente}`}</strong>
                <span style={{ color: '#64748b' }}> (DNI: {acuerdoAFacturar.paciente?.dni || 'S/D'})</span>
              </div>
              <div style={{ marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Obra Social: </span>
                <strong style={{ color: '#1e40af' }}>{acuerdoAFacturar.obraSocialNombre}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Prestación: </span>
                <strong style={{ color: '#0f172a' }}>{acuerdoAFacturar.prestacion?.nombre_prestacion || `ID ${acuerdoAFacturar.id_prestacion}`}</strong>
              </div>
            </div>

            <form onSubmit={guardarFacturaOS}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '5px' }}>
                  N° de Factura / Período *
                </label>
                <input
                  type="text"
                  placeholder="Ej: AGOSTO 2026, Factura 0001-00004523"
                  value={formFactura.nroFactura}
                  onChange={(e) => setFormFactura({ ...formFactura, nroFactura: e.target.value })}
                  style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 'bold' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '5px' }}>
                    Importe a Facturar ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ej: 146465"
                    value={formFactura.monto}
                    onChange={(e) => setFormFactura({ ...formFactura, monto: e.target.value })}
                    style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '15px', fontWeight: 'bold', color: '#2563eb' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '5px' }}>
                    Fecha de Emisión *
                  </label>
                  <input
                    type="date"
                    value={formFactura.fecha}
                    onChange={(e) => setFormFactura({ ...formFactura, fecha: e.target.value })}
                    style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => { setModalFacturarAbierto(false); setAcuerdoAFacturar(null); }}
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '9px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', color: '#475569' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoFactura}
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '9px 20px',
                    borderRadius: '6px',
                    cursor: guardandoFactura ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {guardandoFactura ? 'Generando Factura...' : '📄 Confirmar y Emitir Factura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR FACTURA DE OBRA SOCIAL */}
      {modalEditarFacturaAbierto && facturaAEditar && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            maxWidth: '520px',
            width: '100%',
            padding: '24px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  ✏️ Editar Factura de Obra Social
                </h3>
                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Modificá el número de factura, importe o fecha de emisión.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setModalEditarFacturaAbierto(false); setFacturaAEditar(null); }}
                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '16px', fontSize: '13px' }}>
              <div style={{ marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Obra Social: </span>
                <strong style={{ color: '#1e40af' }}>{facturaAEditar.subtipo}</strong>
              </div>
              <div style={{ marginBottom: '4px' }}>
                <span style={{ color: '#64748b' }}>Detalle actual: </span>
                <span style={{ color: '#334155' }}>{facturaAEditar.concepto}</span>
              </div>
              {facturasMapeadas[facturaAEditar.id_movimiento]?.totalCobrado > 0 && (
                <div style={{ color: '#d97706', fontWeight: '600', marginTop: '6px' }}>
                  ⚠️ Esta factura ya tiene cobranzas registradas por ${facturasMapeadas[facturaAEditar.id_movimiento].totalCobrado.toLocaleString('es-AR')}. El importe no puede ser menor a ese total.
                </div>
              )}
            </div>

            <form onSubmit={guardarEdicionFactura}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '5px' }}>
                  N° de Factura / Período *
                </label>
                <input
                  type="text"
                  placeholder="Ej: AGOSTO 2026, Factura 0005/00154"
                  value={formEditarFactura.nroFactura}
                  onChange={(e) => setFormEditarFactura({ ...formEditarFactura, nroFactura: e.target.value })}
                  style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 'bold' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '5px' }}>
                    Importe Facturado ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ej: 246607.68"
                    value={formEditarFactura.monto}
                    onChange={(e) => setFormEditarFactura({ ...formEditarFactura, monto: e.target.value })}
                    style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '15px', fontWeight: 'bold', color: '#2563eb' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '5px' }}>
                    Fecha de Emisión *
                  </label>
                  <input
                    type="date"
                    value={formEditarFactura.fecha}
                    onChange={(e) => setFormEditarFactura({ ...formEditarFactura, fecha: e.target.value })}
                    style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => { setModalEditarFacturaAbierto(false); setFacturaAEditar(null); }}
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '9px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', color: '#475569' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoEdicion}
                  style={{
                    background: '#2563eb',
                    color: '#fff',
                    border: 'none',
                    padding: '9px 20px',
                    borderRadius: '6px',
                    cursor: guardandoEdicion ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {guardandoEdicion ? 'Guardando...' : '💾 Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR COBRO / PAGO DE OBRA SOCIAL */}
      {modalCobroAbierto && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '12px',
            maxWidth: '780px',
            width: '100%',
            padding: '24px',
            maxHeight: '92vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  💵 Registrar Cobro / Liquidación de O.S.
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Seleccioná la factura que abona la entidad o ingresá un cobro general a cuenta.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setModalCobroAbierto(false); setFacturaSeleccionada(null); setAcuerdoAFacturarCobrar(null); }}
                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={guardarCobroOS}>
              {acuerdoAFacturarCobrar && (
                <div style={{ background: '#fef3c7', border: '1px solid #fde047', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⚡ Facturar y Cobrar en 1 Paso
                  </div>
                  <div style={{ fontSize: '13px', color: '#78350f', marginTop: '4px' }}>
                    Paciente: <strong>{acuerdoAFacturarCobrar.paciente?.nombre_apellido || `ID ${acuerdoAFacturarCobrar.id_paciente}`}</strong> (DNI: {acuerdoAFacturarCobrar.paciente?.dni || 'S/D'})
                  </div>
                  <div style={{ fontSize: '12px', color: '#78350f', marginTop: '2px' }}>
                    Prestación: <strong>{acuerdoAFacturarCobrar.prestacion?.nombre_prestacion}</strong> • Obra Social: <strong>{acuerdoAFacturarCobrar.obraSocialNombre}</strong>
                  </div>
                  <div style={{ fontSize: '11px', color: '#b45309', marginTop: '6px', fontStyle: 'italic' }}>
                    💡 Esta acción emitirá la factura a la Obra Social, registrará el cobro, distribuirá a profesionales (auxiliares a Viviana Jiménez) e impactará en el DEBE y HABER del paciente dejándolo saldado ($0).
                  </div>
                </div>
              )}

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#334155' }}>
                  Obra Social que realiza el pago *
                </label>
                <input
                  type="text"
                  list="lista-os-cobro"
                  placeholder="Ej: BOREAL, SANCOR SALUD, SUBSIDIO DE SALUD, etc."
                  value={formCobro.obraSocial}
                  onChange={(e) => {
                    setFormCobro({ ...formCobro, obraSocial: e.target.value });
                    if (facturaSeleccionada && (facturaSeleccionada.subtipo || '').trim().toUpperCase() !== e.target.value.trim().toUpperCase()) {
                      setFacturaSeleccionada(null);
                    }
                  }}
                  style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 'bold' }}
                  required
                />
                <datalist id="lista-os-cobro">
                  {obrasSocialesLista.map(os => (
                    <option key={os} value={os} />
                  ))}
                </datalist>
              </div>

              {acuerdoAFacturarCobrar && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#334155' }}>
                    N° de Factura / Período a Emitir *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: AGOSTO 2026"
                    value={formCobro.nroFactura || ''}
                    onChange={(e) => setFormCobro({ ...formCobro, nroFactura: e.target.value })}
                    style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 'bold' }}
                    required
                  />
                </div>
              )}

              {/* LISTADO DE FACTURAS PENDIENTES DE COBRO (solo si no es Facturar y Cobrar) */}
              {!acuerdoAFacturarCobrar && (
                <div style={{ marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '13px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>📑 Facturas Pendientes de Cobro</span>
                      {formCobro.obraSocial && (
                        <span style={{ fontSize: '11px', background: '#dbeafe', color: '#1e40af', padding: '1px 6px', borderRadius: '4px' }}>
                          {formCobro.obraSocial}
                        </span>
                      )}
                    </label>
                    {facturaSeleccionada && (
                      <button
                        type="button"
                        onClick={() => seleccionarFacturaEnModal(facturaSeleccionada)}
                        style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}
                      >
                        ✕ Desmarcar factura
                      </button>
                    )}
                  </div>

                  {facturasPendientesModal.length === 0 ? (
                    <div style={{ padding: '10px 12px', background: '#fff', borderRadius: '6px', border: '1px dashed #cbd5e1', fontSize: '12px', color: '#64748b' }}>
                      ℹ️ No hay facturas pendientes {formCobro.obraSocial ? `para ${formCobro.obraSocial}` : 'registradas'}. Podés ingresar un importe manual como pago o anticipo a cuenta corriente.
                    </div>
                  ) : (
                    <div style={{ maxHeight: '170px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {facturasPendientesModal.map(fac => {
                        const isSelected = facturaSeleccionada?.id_movimiento === fac.id_movimiento;
                        return (
                          <div
                            key={fac.id_movimiento}
                            onClick={() => seleccionarFacturaEnModal(fac)}
                            style={{
                              padding: '10px 12px',
                              borderRadius: '6px',
                              border: `2px solid ${isSelected ? '#059669' : '#cbd5e1'}`,
                              background: isSelected ? '#ecfdf5' : '#ffffff',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              boxShadow: isSelected ? '0 2px 4px rgba(5, 150, 105, 0.15)' : '0 1px 2px rgba(0,0,0,0.03)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <div style={{ flex: 1, marginRight: '10px' }}>
                              <div style={{ fontWeight: 'bold', fontSize: '13px', color: isSelected ? '#065f46' : '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span>{isSelected ? '✅' : '📄'}</span>
                                <span>{fac.concepto?.split(' - ')[0] || `Factura #${fac.id_movimiento}`}</span>
                                {!formCobro.obraSocial && (
                                  <span style={{ fontSize: '10px', background: '#e0e7ff', color: '#3730a3', padding: '1px 6px', borderRadius: '4px' }}>
                                    {fac.subtipo}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '11px', color: '#475569', marginTop: '3px', lineHeight: '1.3' }}>
                                {fac.concepto}
                              </div>
                              <div style={{ fontSize: '10px', color: '#64748b', marginTop: '3px' }}>
                                Emisión: {fac.fecha_movimiento} • Total facturado: ${fac.montoFactura.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', minWidth: '105px' }}>
                              <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>Saldo a cobrar:</div>
                              <div style={{ fontSize: '14px', fontWeight: '800', color: '#059669' }}>
                                ${fac.saldoPendiente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </div>
                              <span style={{
                                fontSize: '10px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: isSelected ? '#059669' : '#f1f5f9',
                                color: isSelected ? '#fff' : '#475569',
                                fontWeight: 'bold',
                                marginTop: '4px',
                                display: 'inline-block'
                              }}>
                                {isSelected ? 'SELECCIONADA' : 'Hacé clic aquí'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#334155' }}>
                    Importe Cobrado ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ej: 150000"
                    value={formCobro.monto}
                    onChange={(e) => setFormCobro({ ...formCobro, monto: e.target.value })}
                    style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '15px', fontWeight: 'bold', color: '#16a34a' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#334155' }}>
                    Fecha de Cobro / Depósito *
                  </label>
                  <input
                    type="date"
                    value={formCobro.fecha}
                    onChange={(e) => setFormCobro({ ...formCobro, fecha: e.target.value })}
                    style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px' }}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: (formCobro.formaPago === 'TRANSFERENCIA BANCARIA' || formCobro.formaPago === 'DEPOSITO') ? '1fr 1fr 1fr' : '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#334155' }}>
                    Forma de Pago
                  </label>
                  <select
                    value={formCobro.formaPago}
                    onChange={(e) => setFormCobro({ ...formCobro, formaPago: e.target.value })}
                    style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                  >
                    <option value="TRANSFERENCIA BANCARIA">Transferencia Bancaria</option>
                    <option value="ORDEN DE PAGO">Orden de Pago / Cheque</option>
                    <option value="DEPOSITO">Depósito</option>
                    <option value="RETENCION / COMPENSACION">Retención / Compensación</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </div>

                {(formCobro.formaPago === 'TRANSFERENCIA BANCARIA' || formCobro.formaPago === 'DEPOSITO') && (
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#334155' }}>
                      Banco Receptor
                    </label>
                    <select
                      value={formCobro.banco || 'GALICIA'}
                      onChange={(e) => setFormCobro({ ...formCobro, banco: e.target.value })}
                      style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#fff' }}
                    >
                      <option value="GALICIA">BANCO GALICIA</option>
                      <option value="SANTANDER">BANCO SANTANDER</option>
                      <option value="MACRO">BANCO MACRO</option>
                      <option value="BELO">BELO / DIGITAL</option>
                      <option value="OTRO">OTRO BANCO</option>
                    </select>
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#334155' }}>
                    N° Liquidación / Transf.
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: LIQ-88941 o Transf 9921"
                    value={formCobro.nroComprobante}
                    onChange={(e) => setFormCobro({ ...formCobro, nroComprobante: e.target.value })}
                    style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  />
                </div>
              </div>

              {/* SECCIÓN DISTRIBUCIÓN DE HONORARIOS A PRESTADORES */}
              <div style={{
                marginTop: '16px',
                marginBottom: '18px',
                border: '1px solid #cbd5e1',
                borderRadius: '10px',
                background: '#f8fafc',
                padding: '16px',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', color: '#0f172a' }}>
                    <input
                      type="checkbox"
                      checked={distribuirAPrestadores}
                      onChange={(e) => setDistribuirAPrestadores(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#059669' }}
                    />
                    <span>🩺 Distribución de Honorarios a Prestadores</span>
                  </label>

                  {distribuirAPrestadores && (
                    <div style={{ display: 'flex', background: '#e2e8f0', padding: '3px', borderRadius: '8px' }}>
                      <button
                        type="button"
                        onClick={() => setDistribucionPorMonto(false)}
                        style={{
                          border: 'none',
                          background: !distribucionPorMonto ? '#ffffff' : 'none',
                          color: !distribucionPorMonto ? '#0f172a' : '#64748b',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          boxShadow: !distribucionPorMonto ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                          transition: 'all 0.15s'
                        }}
                      >
                        🔢 Por Sesiones
                      </button>
                      <button
                        type="button"
                        onClick={() => setDistribucionPorMonto(true)}
                        style={{
                          border: 'none',
                          background: distribucionPorMonto ? '#ffffff' : 'none',
                          color: distribucionPorMonto ? '#0f172a' : '#64748b',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          boxShadow: distribucionPorMonto ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                          transition: 'all 0.15s'
                        }}
                      >
                        💵 Por Monto Directo
                      </button>
                    </div>
                  )}
                </div>

                {distribuirAPrestadores && (
                  <>
                    <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#64748b' }}>
                      {distribucionPorMonto 
                        ? "Ingresá directamente el monto en pesos ($) que le corresponde cobrar a cada profesional por esta liquidación de O.S."
                        : "Asigná la cantidad de sesiones dadas por cada profesional para prorratear proporcionalmente el importe cobrado."
                      }
                    </p>

                    {/* Banner Informativo de Totales y Retención */}
                    {(() => {
                      const impCobro = parsearMoneda(formCobro.monto);
                      let totalDistribuido = 0;
                      if (distribucionPorMonto) {
                        totalDistribuido = Object.values(montosPrestadores).reduce((acc, curr) => acc + (parseFloat(curr) || 0), 0);
                      } else {
                        const totalSes = Object.values(sesionesPrestadores).reduce((acc, curr) => acc + (parseInt(curr) || 0), 0);
                        totalDistribuido = totalSes > 0 ? impCobro : 0;
                      }
                      const restante = Math.max(0, impCobro - totalDistribuido);
                      const superaTotal = totalDistribuido > (impCobro + 0.01);

                      return (
                        <div style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '8px',
                          background: superaTotal ? '#fee2e2' : '#ffffff',
                          padding: '9px 14px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          marginBottom: '12px',
                          border: `1px solid ${superaTotal ? '#fca5a5' : '#cbd5e1'}`
                        }}>
                          <span>Total Cobro: <strong>${impCobro.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong></span>
                          <span>Distribuido: <strong style={{ color: superaTotal ? '#dc2626' : '#16a34a' }}>
                            ${totalDistribuido.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </strong></span>
                          {superaTotal ? (
                            <span style={{ color: '#dc2626', fontWeight: 'bold' }}>
                              ⚠️ Excede por ${(totalDistribuido - impCobro).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span>Retención / Centro: <strong style={{ color: '#475569' }}>
                              ${restante.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </strong></span>
                          )}
                        </div>
                      );
                    })()}

                    {/* Tabla Interactiva de Prestadores */}
                    {cargandoPrestadores ? (
                      <p style={{ fontSize: '13px', color: '#64748b' }}>Cargando y autocompletando prestadores...</p>
                    ) : prestadoresList.length === 0 ? (
                      <p style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>No se encontraron prestadores activos en prestadores_motor.</p>
                    ) : (
                      <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden', background: '#fff', maxHeight: '230px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                          <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>
                            <tr style={{ color: '#475569', borderBottom: '1px solid #cbd5e1' }}>
                              <th style={{ padding: '7px 10px' }}>Prestador</th>
                              <th style={{ padding: '7px 10px' }}>Especialidad</th>
                              {!distribucionPorMonto ? (
                                <>
                                  <th style={{ padding: '7px 10px', width: '85px', textAlign: 'center' }}>Sesiones</th>
                                  <th style={{ padding: '7px 10px', textAlign: 'right' }}>Haber Estimado</th>
                                </>
                              ) : (
                                <th style={{ padding: '7px 10px', width: '130px', textAlign: 'right' }}>Monto Directo ($)</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {prestadoresList.map(p => {
                              const ses = sesionesPrestadores[p.id_prestador] || 0;
                              const totalSes = Object.values(sesionesPrestadores).reduce((acc, curr) => acc + (parseInt(curr) || 0), 0);
                              const impCobro = parsearMoneda(formCobro.monto);
                              const estimado = totalSes > 0 ? ((ses / totalSes) * impCobro).toFixed(2) : '0.00';
                              const montoDirecto = montosPrestadores[p.id_prestador] || '';

                              return (
                                <tr key={p.id_prestador} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                  <td style={{ padding: '6px 10px', fontWeight: '500', color: '#1e293b' }}>
                                    {p.nombre_prestador}
                                  </td>
                                  <td style={{ padding: '6px 10px', color: '#64748b' }}>
                                    {p.especialidad || 'General'}
                                  </td>
                                  {!distribucionPorMonto ? (
                                    <>
                                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                        <input
                                          type="number"
                                          min="0"
                                          value={ses}
                                          onChange={(e) => {
                                            const val = Math.max(0, parseInt(e.target.value) || 0);
                                            setSesionesPrestadores(prev => ({
                                              ...prev,
                                              [p.id_prestador]: val
                                            }));
                                          }}
                                          style={{ width: '50px', padding: '3px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'center', fontSize: '12px' }}
                                        />
                                      </td>
                                      <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 'bold', color: parseFloat(estimado) > 0 ? '#16a34a' : '#94a3b8' }}>
                                        ${parseFloat(estimado).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                      </td>
                                    </>
                                  ) : (
                                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                      <input
                                        type="number"
                                        min="0"
                                        step="any"
                                        value={montoDirecto}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setMontosPrestadores(prev => ({
                                            ...prev,
                                            [p.id_prestador]: val
                                          }));
                                        }}
                                        placeholder="0.00"
                                        style={{ width: '105px', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a', fontSize: '12px' }}
                                      />
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '13px', color: '#334155' }}>
                  Observaciones / Período
                </label>
                <textarea
                  rows="2"
                  placeholder="Ej: Liquidación correspondiente al período Agosto 2026..."
                  value={formCobro.observaciones}
                  onChange={(e) => setFormCobro({ ...formCobro, observaciones: e.target.value })}
                  style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => { setModalCobroAbierto(false); setFacturaSeleccionada(null); setAcuerdoAFacturarCobrar(null); }}
                  disabled={guardandoCobro}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#f1f5f9',
                    color: '#334155',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '13px'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoCobro}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    background: acuerdoAFacturarCobrar ? '#059669' : '#059669',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {guardandoCobro
                    ? 'Procesando...'
                    : (acuerdoAFacturarCobrar ? '⚡ Confirmar Factura y Cobro' : 'Registrar Cobro en O.S.')
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
