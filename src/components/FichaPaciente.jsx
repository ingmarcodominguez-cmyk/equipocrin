import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

export default function FichaPaciente({ onVolver, usuario }) {
  const [listaPacientes, setListaPacientes] = useState([]);
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [acuerdos, setAcuerdos] = useState([]);
  const [deudasAgrupadas, setDeudasAgrupadas] = useState([]);
  const [movimientosDetallados, setMovimientosDetallados] = useState([]);
  const [prestaciones, setPrestaciones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [cargandoPacientes, setCargandoPacientes] = useState(true);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  
  const [vistaActiva, setVistaActiva] = useState('menu');

  // Estados para Registro de Pago
  const [modalPagoAbierto, setModalPagoAbierto] = useState(false);
  const [prestadoresList, setPrestadoresList] = useState([]);
  const [cargandoPrestadores, setCargandoPrestadores] = useState(false);
  const [deudaSeleccionadaId, setDeudaSeleccionadaId] = useState('');
  const [importePago, setImportePago] = useState('');
  const [fechaPago, setFechaPago] = useState('');
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [billeteraNombre, setBilleteraNombre] = useState('MERCADOPAGO');
  const [bancoNombre, setBancoNombre] = useState('GALICIA');
  const [turnoSeleccionado, setTurnoSeleccionado] = useState('MAÑANA');
  const [recibidoPor, setRecibidoPor] = useState('');
  const [entregadoPor, setEntregadoPor] = useState('');
  const [sesionesPrestadores, setSesionesPrestadores] = useState({});
  const [procesandoPago, setProcesandoPago] = useState(false);

  // Estados para Nota de Crédito / Débito (Ajustes)
  const [modalAjusteAbierto, setModalAjusteAbierto] = useState(false);
  const [tipoAjusteSeleccionado, setTipoAjusteSeleccionado] = useState('nota_credito');
  const [deudaAjusteId, setDeudaAjusteId] = useState('');
  const [importeAjuste, setImporteAjuste] = useState('');
  const [fechaAjuste, setFechaAjuste] = useState('');
  const [conceptoAjuste, setConceptoAjuste] = useState('');
  const [observacionAjuste, setObservacionAjuste] = useState('');
  const [procesandoAjuste, setProcesandoAjuste] = useState(false);

  useEffect(() => {
    async function cargarDatosIniciales() {
      try {
        const [
          { data: pacientesData, error: errorPacientes },
          { data: prestacionesData, error: errorPrestaciones }
        ] = await Promise.all([
          supabase.from('pacientes_motor').select('*'),
          supabase.from('prestaciones_motor').select('*')
        ]);

        if (errorPacientes) throw errorPacientes;
        if (errorPrestaciones) throw errorPrestaciones;

        const ordenados = (pacientesData || []).sort((a, b) => {
          const nombreA = (a.nombre_apellido || '').toLowerCase();
          const nombreB = (b.nombre_apellido || '').toLowerCase();
          return nombreA.localeCompare(nombreB);
        });

        setListaPacientes(ordenados);
        setPrestaciones(prestacionesData || []);
      } catch (error) {
        console.error('Error al inicializar datos:', error);
        setMensaje({ texto: 'Error al cargar datos iniciales: ' + error.message, tipo: 'error' });
      } finally {
        setCargandoPacientes(false);
      }
    }
    cargarDatosIniciales();
  }, []);

  const parsearMoneda = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    
    const str = String(val).trim();
    
    // Si contiene coma, asumimos formato en español (ej: 290.400,00 o 16770,6)
    if (str.includes(',')) {
      const limpio = str.replace(/\./g, '').replace(',', '.');
      const num = Number(limpio);
      return isNaN(num) ? 0 : num;
    }
    
    // Si no contiene coma pero contiene puntos
    if (str.includes('.')) {
      const partes = str.split('.');
      // Si hay más de un punto, son separadores de miles (ej: 1.290.400)
      if (partes.length > 2) {
        const limpio = str.replace(/\./g, '');
        const num = Number(limpio);
        return isNaN(num) ? 0 : num;
      }
      
      // Si hay un solo punto, puede ser decimal (16770.6) o miles (290.400)
      // Si la parte decimal tiene exactamente 3 dígitos, se asume que es miles (ej: 290.400 o 1.500)
      const decimales = partes[1];
      if (decimales.length === 3) {
        const limpio = str.replace(/\./g, '');
        const num = Number(limpio);
        return isNaN(num) ? 0 : num;
      }
      
      // En cualquier otro caso (ej: 16770.6, 16770.60, 15.5), el punto es decimal
      const num = Number(str);
      return isNaN(num) ? 0 : num;
    }
    
    // Si no tiene puntos ni comas, es un número entero limpio
    const num = Number(str);
    return isNaN(num) ? 0 : num;
  };

  const seleccionarPacientePorId = async (e) => {
    const pacienteIdStr = e.target.value;
    if (!pacienteIdStr) {
      setPacienteSeleccionado(null);
      setAcuerdos([]);
      setDeudasAgrupadas([]);
      setMovimientosDetallados([]);
      setVistaActiva('menu');
      return;
    }

    const pacienteEncontrado = listaPacientes.find(p => String(p.id_paciente) === String(pacienteIdStr));
    setPacienteSeleccionado(pacienteEncontrado);
    setVistaActiva('menu');
    setCargando(true);
    setMensaje({ texto: '', tipo: '' });

    try {
      const [
        { data: acuerdosData, error: errorAcuerdos },
        { data: movimientosData, error: errorMovimientos }
      ] = await Promise.all([
        supabase.from('acuerdos_motor').select('*').eq('id_paciente', pacienteEncontrado.id_paciente),
        supabase.from('movimientoscuenta_motor').select('*').eq('id_paciente', pacienteEncontrado.id_paciente)
      ]);

      if (errorAcuerdos) throw errorAcuerdos;
      if (errorMovimientos) throw errorMovimientos;

      const acuerdosConPrestacion = (acuerdosData || []).map(acuerdo => {
        const prestacionEncontrada = prestaciones.find(
          p => String(p.id_prestacion).trim() === String(acuerdo.id_prestacion).trim()
        );
        return {
          ...acuerdo,
          nombre_prestacion: prestacionEncontrada ? prestacionEncontrada.nombre_prestacion : `Prestación ID: ${acuerdo.id_prestacion || 'S/D'}`
        };
      });

      const acuerdosSinCeros = acuerdosConPrestacion.filter(acuerdo => {
        const valor = acuerdo.importe_actual;
        if (valor === null || valor === undefined || valor === '') return false;
        return parsearMoneda(valor) !== 0;
      });

      setAcuerdos(acuerdosSinCeros);

      const movimientosEnriquecidos = (movimientosData || []).map(mov => {
        const acuerdoAsociado = acuerdosConPrestacion.find(ac => String(ac.id_acuerdo) === String(mov.id_acuerdo));
        return {
          ...mov,
          nombre_prestacion: acuerdoAsociado ? acuerdoAsociado.nombre_prestacion : (mov.id_acuerdo ? `Acuerdo ID: ${mov.id_acuerdo}` : 'Sin Acuerdo')
        };
      });

      // Ordenamos cronológicamente por fecha_movimiento y luego por id_movimiento
      const movimientosOrdenados = movimientosEnriquecidos.sort((a, b) => {
        const dateA = a.fecha_movimiento || a.fecha_vencimiento || '';
        const dateB = b.fecha_movimiento || b.fecha_vencimiento || '';
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        const idA = parseInt(a.id_movimiento, 10) || 0;
        const idB = parseInt(b.id_movimiento, 10) || 0;
        return idA - idB;
      });

      setMovimientosDetallados(movimientosOrdenados);

      const mapaDeudas = {};

      (movimientosData || []).forEach(mov => {
        const idDeuda = mov.id_deuda;
        if (!idDeuda) return;

        if (!mapaDeudas[idDeuda]) {
          mapaDeudas[idDeuda] = {
            id_deuda: idDeuda,
            movimientos: []
          };
        }
        mapaDeudas[idDeuda].movimientos.push(mov);
      });

      const deudasProcesadas = Object.values(mapaDeudas).map(grupo => {
        let totalDebe = 0;
        let totalHaber = 0;
        let idAcuerdoEncontrado = null;
        let subtipoPrincipal = 'S/D';
        let conceptoPrincipal = 'S/D';
        let fechaVencimiento = 'S/D';

        const movimientoGenerador = grupo.movimientos.find(m => {
          const sub = (m.subtipo || '').trim().toLowerCase();
          return sub === 'acuerdo_unico' || sub === 'cuota_mensual';
        });

        if (movimientoGenerador) {
          subtipoPrincipal = movimientoGenerador.subtipo;
          conceptoPrincipal = movimientoGenerador.concepto || 'S/D';
          idAcuerdoEncontrado = movimientoGenerador.id_acuerdo;
          fechaVencimiento = movimientoGenerador.fecha_vencimiento || movimientoGenerador.fecha_movimiento || 'S/D';
        } else {
          const primerMov = grupo.movimientos[0];
          subtipoPrincipal = primerMov.subtipo || 'S/D';
          conceptoPrincipal = primerMov.concepto || 'S/D';
          idAcuerdoEncontrado = primerMov.id_acuerdo;
          fechaVencimiento = primerMov.fecha_vencimiento || primerMov.fecha_movimiento || 'S/D';
        }

        grupo.movimientos.forEach(m => {
          totalDebe += parsearMoneda(m.debe);
          totalHaber += parsearMoneda(m.haber);
          if (!idAcuerdoEncontrado && m.id_acuerdo) {
            idAcuerdoEncontrado = m.id_acuerdo;
          }
        });

        const saldoReal = totalDebe - totalHaber;

        const acuerdoAsociado = acuerdosConPrestacion.find(ac => String(ac.id_acuerdo) === String(idAcuerdoEncontrado));

        return {
          id_deuda: grupo.id_deuda,
          id_acuerdo: idAcuerdoEncontrado,
          subtipo: subtipoPrincipal,
          concepto: conceptoPrincipal,
          fecha_vencimiento: fechaVencimiento,
          saldoReal,
          nombre_prestacion: acuerdoAsociado ? acuerdoAsociado.nombre_prestacion : (idAcuerdoEncontrado ? `Acuerdo ID: ${idAcuerdoEncontrado}` : 'Sin Acuerdo')
        };
      });

      const deudasConSaldoPendiente = deudasProcesadas.filter(d => Math.abs(d.saldoReal) > 0.01);

      setDeudasAgrupadas(deudasConSaldoPendiente);

    } catch (error) {
      console.error('Error al cargar datos del paciente:', error);
      setMensaje({ texto: 'Error al cargar información del paciente: ' + error.message, tipo: 'error' });
    } finally {
      setCargando(false);
    }
  };

  const actualizarAcuerdoEnBD = async (idAcuerdo, campo, valor) => {
    try {
      const { error } = await supabase
        .from('acuerdos_motor')
        .update({ [campo]: valor })
        .eq('id_acuerdo', idAcuerdo);

      if (error) throw error;

      if (campo === 'importe_actual') {
        const num = parsearMoneda(valor);
        if (num === 0 || valor === '' || valor === null) {
          setAcuerdos(acuerdos.filter(ac => ac.id_acuerdo !== idAcuerdo));
          setMensaje({ texto: 'Acuerdo ocultado por tener importe 0.', tipo: 'exito' });
          setTimeout(() => setMensaje({ texto: '', tipo: '' }), 2500);
          return;
        }
      }

      setAcuerdos(acuerdos.map(ac => ac.id_acuerdo === idAcuerdo ? { ...ac, [campo]: valor } : ac));
      setMensaje({ texto: 'Modificación guardada.', tipo: 'exito' });
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 2500);
    } catch (error) {
      console.error('Error al actualizar:', error);
      setMensaje({ texto: 'Error al guardar el cambio.', tipo: 'error' });
    }
  };

  useEffect(() => {
    if (modalPagoAbierto) {
      async function cargarPrestadores() {
        setCargandoPrestadores(true);
        try {
          const { data, error } = await supabase
            .from('prestadores_motor')
            .select('*');
          if (error) throw error;
          const activos = (data || []).filter(p => !p.estado || (p.estado || '').trim().toUpperCase() === 'ACTIVO');
          setPrestadoresList(activos);
          
          // Inicializar las sesiones a 0 para cada prestador
          const sesInitial = {};
          activos.forEach(p => {
            sesInitial[p.id_prestador] = 0;
          });
          setSesionesPrestadores(sesInitial);
        } catch (error) {
          console.error("Error al cargar prestadores:", error);
        } finally {
          setCargandoPrestadores(false);
        }
      }
      cargarPrestadores();
      
      // Inicializar campos de pago por defecto
      setFechaPago(localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0]);
      setFormaPago('Efectivo');
      setBilleteraNombre('MERCADOPAGO');
      setBancoNombre('GALICIA');
      setTurnoSeleccionado('MAÑANA');
      setRecibidoPor(usuario || '');
      setEntregadoPor(pacienteSeleccionado?.nombre_apellido || '');
      setImportePago('');
      setDeudaSeleccionadaId('');
    }
  }, [modalPagoAbierto, pacienteSeleccionado, usuario]);

  const confirmarRegistroPago = async () => {
    // 1. Validar Importe
    const importeNum = parseFloat(importePago);
    if (isNaN(importeNum) || importeNum <= 0) {
      alert("Por favor ingrese un importe de pago válido mayor a 0.");
      return;
    }
    
    // 2. Validar Fecha
    if (!fechaPago || fechaPago.trim() === '') {
      alert("Por favor seleccione la fecha del pago.");
      return;
    }
    
    // 3. Validar Deuda Seleccionada
    if (!deudaSeleccionadaId) {
      alert("Por favor seleccione la deuda a pagar.");
      return;
    }
    
    // 4. Validar Detalles según la Forma de Pago
    if (formaPago === 'QR (Mercado Pago)') {
      if (!billeteraNombre || billeteraNombre.trim() === '') {
        alert("Por favor seleccione la billetera virtual.");
        return;
      }
    } else if (formaPago === 'Transferencia / Depósito') {
      if (!bancoNombre || bancoNombre.trim() === '') {
        alert("Por favor seleccione el banco receptor.");
        return;
      }
    }
    
    // 5. Validar Distribución de Sesiones a Prestadores
    const totalSesiones = Object.values(sesionesPrestadores).reduce((acc, curr) => acc + (parseInt(curr) || 0), 0);
    if (totalSesiones <= 0) {
      alert("Por favor distribuya al menos 1 sesión entre los prestadores de la lista para poder proceder con el pago.");
      return;
    }
    
    setProcesandoPago(true);
    try {
      // 1. Obtener el próximo id_pago consultando movimientoscuenta_motor (filtrando NULL)
      const { data: maxPagoDataMov, error: errorMaxPagoMov } = await supabase
        .from('movimientoscuenta_motor')
        .select('id_pago')
        .not('id_pago', 'is', null)
        .order('id_pago', { ascending: false })
        .limit(1);
        
      if (errorMaxPagoMov) throw errorMaxPagoMov;

      // También consultamos movprestadores_motor para asegurar unicidad
      const { data: maxPagoDataPrest, error: errorMaxPagoPrest } = await supabase
        .from('movprestadores_motor')
        .select('id_pago')
        .not('id_pago', 'is', null)
        .order('id_pago', { ascending: false })
        .limit(1);

      if (errorMaxPagoPrest) throw errorMaxPagoPrest;

      // También consultamos pagos_motor
      const { data: maxPagoDataMotorTab, error: errorMaxPagoDataMotor } = await supabase
        .from('pagos_motor')
        .select('id_pago')
        .not('id_pago', 'is', null)
        .order('id_pago', { ascending: false })
        .limit(1);

      if (errorMaxPagoDataMotor) throw errorMaxPagoDataMotor;

      const maxPagoMov = (maxPagoDataMov && maxPagoDataMov[0]?.id_pago) ? parseInt(maxPagoDataMov[0].id_pago) : 0;
      const maxPagoPrest = (maxPagoDataPrest && maxPagoDataPrest[0]?.id_pago) ? parseInt(maxPagoDataPrest[0].id_pago) : 0;
      const maxPagoMotorTab = (maxPagoDataMotorTab && maxPagoDataMotorTab[0]?.id_pago) ? parseInt(maxPagoDataMotorTab[0].id_pago) : 0;
      const nextIdPago = Math.max(maxPagoMov, maxPagoPrest, maxPagoMotorTab) + 1;

      // 1b. Obtener el próximo id_movimiento consultando movimientoscuenta_motor para evitar violar la pkey
      const { data: maxMovData, error: errorMaxMov } = await supabase
        .from('movimientoscuenta_motor')
        .select('id_movimiento')
        .order('id_movimiento', { ascending: false })
        .limit(1);

      if (errorMaxMov) throw errorMaxMov;
      const nextIdMovimiento = (maxMovData && maxMovData[0]?.id_movimiento ? parseInt(maxMovData[0].id_movimiento) : 0) + 1;
      
      // 2. Obtener deudas agrupadas y buscar la seleccionada
      const deudaSeleccionada = deudasAgrupadas.find(d => String(d.id_deuda) === String(deudaSeleccionadaId));
      if (!deudaSeleccionada) {
        throw new Error("La deuda seleccionada no es válida.");
      }
      
      // 3. Lógica FIFO de asignación de importes
      const asignaciones = [];
      const balanceSeleccionada = deudaSeleccionada.saldoReal;
      const montoAsignadoSeleccionada = Math.min(importeNum, balanceSeleccionada);
      
      asignaciones.push({
        id_deuda: deudaSeleccionada.id_deuda,
        id_acuerdo: deudaSeleccionada.id_acuerdo,
        montoAsignado: montoAsignadoSeleccionada,
        concepto: deudaSeleccionada.concepto
      });
      
      let restante = importeNum - montoAsignadoSeleccionada;
      
      if (restante > 0) {
        const otrasDeudas = deudasAgrupadas
          .filter(d => String(d.id_deuda) !== String(deudaSeleccionadaId))
          .sort((a, b) => {
            const dateA = a.fecha_vencimiento || '';
            const dateB = b.fecha_vencimiento || '';
            return dateA.localeCompare(dateB);
          });
          
        for (const d of otrasDeudas) {
          if (restante <= 0) break;
          const monto = Math.min(restante, d.saldoReal);
          if (monto > 0) {
            asignaciones.push({
              id_deuda: d.id_deuda,
              id_acuerdo: d.id_acuerdo,
              montoAsignado: monto,
              concepto: d.concepto
            });
            restante -= monto;
          }
        }
      }
      
      // Si todavía sobra dinero (sobrepago absoluto), lo asignamos a la deuda seleccionada inicial
      if (restante > 0) {
        asignaciones[0].montoAsignado = Math.round((asignaciones[0].montoAsignado + restante) * 100) / 100;
      }
      
      // 4. Insertar registros en movimientoscuenta_motor
      const nuevosMovimientos = asignaciones.map((asig, idx) => ({
        id_movimiento: nextIdMovimiento + idx,
        id_paciente: pacienteSeleccionado.id_paciente,
        id_acuerdo: asig.id_acuerdo,
        id_deuda: asig.id_deuda,
        fecha_movimiento: fechaPago,
        fecha_cuota_origen: fechaPago,
        fecha_vencimiento: fechaPago,
        tipo_movimiento: 'pago',
        subtipo: 'pago_cuota',
        concepto: `Cobro: Pago de ${asig.concepto}`,
        debe: '0',
        haber: asig.montoAsignado.toString(),
        saldo: '0.00',
        id_pago: nextIdPago,
        usuario: usuario || 'Sistema'
      }));
      
      const { error: errInsertMovs } = await supabase
        .from('movimientoscuenta_motor')
        .insert(nuevosMovimientos);
        
      if (errInsertMovs) throw errInsertMovs;
      
      // 5. Insertar en caja_motor, billeteras_motor o bancos_motor según el medio de pago
      if (formaPago === 'Efectivo') {
        const registroCaja = {
          fecha: fechaPago,
          usuario: usuario || 'Sistema',
          recibido_por: null,
          entregado_por: null,
          turno: null,
          id_turno: null,
          tipo: 'INGRESO',
          concepto: `Cobranza paciente: ${pacienteSeleccionado.nombre_apellido}`,
          medio_pago: 'EFECTIVO',
          importe: importeNum.toString(),
          saldo: '0.00',
          id_pago: nextIdPago,
          observaciones: `Imputado a deuda ID: ${deudaSeleccionadaId}`,
          cierre_turno: false
        };
        
        const { error: errCaja } = await supabase.from('caja_motor').insert([registroCaja]);
        if (errCaja) throw errCaja;
        
      } else if (formaPago === 'QR (Mercado Pago)') {
        const registroBilletera = {
          fecha: fechaPago,
          usuario: usuario || 'Sistema',
          billetera: billeteraNombre.toUpperCase(),
          tipo: 'INGRESO',
          concepto: `Cobranza paciente QR: ${pacienteSeleccionado.nombre_apellido}`,
          importe: importeNum,
          saldo: importeNum,
          id_pago: nextIdPago
        };
        
        const { error: errBill } = await supabase.from('billeteras_motor').insert([registroBilletera]);
        if (errBill) throw errBill;
        
      } else if (formaPago === 'Transferencia / Depósito') {
        const registroBanco = {
          fecha: fechaPago,
          usuario: usuario || 'Sistema',
          banco: bancoNombre.toUpperCase(),
          tipo: 'INGRESO',
          concepto: `Cobranza paciente Transf: ${pacienteSeleccionado.nombre_apellido}`,
          importe: importeNum,
          saldo: importeNum,
          id_pago: nextIdPago
        };
        
        const { error: errBanco } = await supabase.from('bancos_motor').insert([registroBanco]);
        if (errBanco) throw errBanco;
      }
      
      // 6. Distribuir a prestadores e insertar en movprestadores_motor
      const totalSesiones = Object.values(sesionesPrestadores).reduce((acc, curr) => acc + (parseInt(curr) || 0), 0);
      if (totalSesiones > 0) {
        const prestadoresConSesiones = prestadoresList.filter(p => (sesionesPrestadores[p.id_prestador] || 0) > 0);
        
        const importesDistribuidos = {};
        let sumaImportes = 0;
        
        prestadoresConSesiones.forEach((p) => {
          const ses = sesionesPrestadores[p.id_prestador];
          let share = (ses / totalSesiones) * importeNum;
          share = Math.round(share * 100) / 100;
          
          importesDistribuidos[p.id_prestador] = share;
          sumaImportes += share;
        });
        
        const diffRedondeo = Math.round((importeNum - sumaImportes) * 100) / 100;
        if (diffRedondeo !== 0 && prestadoresConSesiones.length > 0) {
    
    
          const firstId = prestadoresConSesiones[0].id_prestador;
          importesDistribuidos[firstId] = Math.round((importesDistribuidos[firstId] + diffRedondeo) * 100) / 100;
        }
        
        const nuevosMovPrestadores = prestadoresConSesiones.map(p => ({
          id_prestador: p.id_prestador,
          id_paciente: pacienteSeleccionado.id_paciente,
          fecha: fechaPago,
          id_pago: nextIdPago,
          concepto: `Liquidación paciente: ${pacienteSeleccionado.nombre_apellido}`,
          debe: '0',
          haber: importesDistribuidos[p.id_prestador].toString(),
          saldo: '0.00',
          usuario: usuario || 'Sistema',
          acuerdo: deudaSeleccionada.nombre_prestacion || `Acuerdo ID: ${deudaSeleccionada.id_acuerdo}`
        }));
        
        const { error: errInsertPrestadores } = await supabase
          .from('movprestadores_motor')
          .insert(nuevosMovPrestadores);
          
        if (errInsertPrestadores) throw errInsertPrestadores;
      }
      
      // 7. Insertar registro en pagos_motor
      const nuevoRegistroPago = {
        id_pago: nextIdPago,
        id_cuota: null,
        id_paciente: pacienteSeleccionado.id_paciente.toString(),
        fecha_pago: fechaPago,
        importe: importeNum.toString().replace('.', ','),
        observacion: `Imputado a deuda ID: ${deudaSeleccionadaId}`,
        forma_pago: formaPago.toUpperCase(),
        usuario: usuario || 'Sistema',
        fecha_registro: new Date().toISOString(),
        id_acuerdo: deudaSeleccionada.id_acuerdo,
        estado: 'ACTIVO'
      };

      const { error: errInsertPagoMotor } = await supabase
        .from('pagos_motor')
        .insert([nuevoRegistroPago]);

      if (errInsertPagoMotor) throw errInsertPagoMotor;
      
      setMensaje({ texto: "Pago registrado exitosamente.", tipo: 'exito' });
      setModalPagoAbierto(false);
      
      // Simular recarga de la ficha de paciente
      seleccionarPacientePorId({ target: { value: pacienteSeleccionado.id_paciente } });
      
    } catch (error) {
      console.error("Error al registrar pago:", error);
      alert("Error al registrar pago: " + error.message);
    } finally {
      setProcesandoPago(false);
    }
  };

  useEffect(() => {
    if (modalAjusteAbierto) {
      setFechaAjuste(localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0]);
      setDeudaAjusteId('');
      setImporteAjuste('');
      setConceptoAjuste(tipoAjusteSeleccionado === 'nota_credito' ? 'Bonificación por acuerdo' : 'Intereses por mora');
      setObservacionAjuste('');
    }
  }, [modalAjusteAbierto, tipoAjusteSeleccionado]);

  const confirmarRegistroAjuste = async () => {
    const importeNum = parseFloat(importeAjuste);
    if (isNaN(importeNum) || importeNum <= 0) {
      alert("Por favor ingrese un importe válido mayor a 0.");
      return;
    }
    if (!deudaAjusteId) {
      alert("Por favor seleccione la deuda a la cual aplicar el ajuste.");
      return;
    }
    
    setProcesandoAjuste(true);
    try {
      // 1. Encontrar la deuda seleccionada
      const mapaSaldos = {};
      movimientosDetallados.forEach(m => {
        if (!m.id_deuda) return;
        if (!mapaSaldos[m.id_deuda]) {
          mapaSaldos[m.id_deuda] = {
            id_deuda: m.id_deuda,
            concepto: m.concepto || `Deuda #${m.id_deuda}`,
            id_acuerdo: m.id_acuerdo
          };
        }
      });
      const deuda = mapaSaldos[deudaAjusteId];
      if (!deuda) {
        throw new Error("Deuda seleccionada no encontrada.");
      }
      
      // 2. Insertar en la tabla ajustes_motor
      const registroAjuste = {
        id_paciente: pacienteSeleccionado.id_paciente,
        fecha_ajuste: fechaAjuste,
        tipo_ajuste: tipoAjusteSeleccionado,
        importe: importeNum.toString(),
        concepto: conceptoAjuste || (tipoAjusteSeleccionado === 'nota_credito' ? 'Nota de Crédito' : 'Nota de Débito'),
        observacion: observacionAjuste || '',
        usuario: usuario || 'Sistema'
      };
      
      const { error: errAjuste } = await supabase
        .from('ajustes_motor')
        .insert([registroAjuste]);
        
      if (errAjuste) throw errAjuste;
      
      // 3. Obtener el próximo id_movimiento
      const { data: maxMovData, error: errorMaxMov } = await supabase
        .from('movimientoscuenta_motor')
        .select('id_movimiento')
        .order('id_movimiento', { ascending: false })
        .limit(1);

      if (errorMaxMov) throw errorMaxMov;
      const nextIdMovimiento = (maxMovData && maxMovData[0]?.id_movimiento ? parseInt(maxMovData[0].id_movimiento) : 0) + 1;

      // 3b. Insertar en movimientoscuenta_motor para impactar el saldo de la cuenta corriente
      const nuevoMovimiento = {
        id_movimiento: nextIdMovimiento,
        id_paciente: pacienteSeleccionado.id_paciente,
        id_acuerdo: deuda.id_acuerdo,
        id_deuda: deuda.id_deuda,
        fecha_movimiento: fechaAjuste,
        fecha_cuota_origen: fechaAjuste,
        fecha_vencimiento: fechaAjuste,
        tipo_movimiento: 'ajuste',
        subtipo: tipoAjusteSeleccionado,
        concepto: `${tipoAjusteSeleccionado === 'nota_credito' ? 'N.Crédito' : 'N.Débito'}: ${conceptoAjuste}`,
        debe: tipoAjusteSeleccionado === 'nota_debito' ? importeNum.toString() : '0',
        haber: tipoAjusteSeleccionado === 'nota_credito' ? importeNum.toString() : '0',
        saldo: '0.00',
        usuario: usuario || 'Sistema'
      };
      
      const { error: errMov } = await supabase
        .from('movimientoscuenta_motor')
        .insert([nuevoMovimiento]);
        
      if (errMov) throw errMov;
      
      setMensaje({ texto: `${tipoAjusteSeleccionado === 'nota_credito' ? 'Nota de Crédito' : 'Nota de Débito'} registrada correctamente.`, tipo: 'exito' });
      setModalAjusteAbierto(false);
      
      // Recargar la ficha de paciente
      seleccionarPacientePorId({ target: { value: pacienteSeleccionado.id_paciente } });
      
    } catch (error) {
      console.error("Error al registrar ajuste:", error);
      alert("Error al registrar ajuste: " + error.message);
    } finally {
      setProcesandoAjuste(false);
    }
  };

  const manejarReversionPago = async (idPago) => {
    if (!window.confirm(`¿Está seguro de que desea revertir el pago con ID Pago #${idPago}? Esto insertará contra-movimientos en la cuenta corriente, caja/medios de pago, y liquidaciones de prestadores.`)) {
      return;
    }
    
    setCargando(true);
    setMensaje({ texto: 'Procesando reversión de pago...', tipo: 'info' });
    
    try {
      const fechaHoy = localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0];

      // 1. Obtener movimientos originales de movimientoscuenta_motor con ese id_pago
      const { data: movsOriginales, error: errGetMovs } = await supabase
        .from('movimientoscuenta_motor')
        .select('*')
        .eq('id_pago', idPago);
        
      if (errGetMovs) throw errGetMovs;
      
      if (!movsOriginales || movsOriginales.length === 0) {
        throw new Error("No se encontraron registros del pago original en movimientoscuenta_motor.");
      }

      // Filtrar movimientos que ya hayan sido revertidos para no duplicar la reversión
      const { data: reversosExistentes, error: errCheckRevs } = await supabase
        .from('movimientoscuenta_motor')
        .select('*')
        .eq('id_pago', idPago)
        .eq('subtipo', 'reverso_pago');
        
      if (errCheckRevs) throw errCheckRevs;
      if (reversosExistentes && reversosExistentes.length > 0) {
        throw new Error("Este pago ya ha sido revertido anteriormente.");
      }

      // 1c. Obtener el próximo id_movimiento para la reversión
      const { data: maxMovData, error: errorMaxMov } = await supabase
        .from('movimientoscuenta_motor')
        .select('id_movimiento')
        .order('id_movimiento', { ascending: false })
        .limit(1);

      if (errorMaxMov) throw errorMaxMov;
      const nextIdMovimiento = (maxMovData && maxMovData[0]?.id_movimiento ? parseInt(maxMovData[0].id_movimiento) : 0) + 1;

      // 2. Insertar contra-movimientos en movimientoscuenta_motor (Reverso del Pago)
      const nuevosReversosMov = movsOriginales.map((orig, idx) => {
        const valDebeOrig = parsearMoneda(orig.debe);
        const valHaberOrig = parsearMoneda(orig.haber);
        
        return {
          id_movimiento: nextIdMovimiento + idx,
          id_paciente: orig.id_paciente,
          id_acuerdo: orig.id_acuerdo,
          id_deuda: orig.id_deuda,
          fecha_movimiento: fechaHoy,
          fecha_cuota_origen: fechaHoy,
          fecha_vencimiento: fechaHoy,
          tipo_movimiento: 'ajuste',
          subtipo: 'reverso_pago',
          concepto: `REVERSO Pago: ${orig.concepto}`,
          debe: valHaberOrig.toString(), // Lo que estaba en Haber pasa a Debe (aumenta deuda)
          haber: valDebeOrig.toString(), // Lo que estaba en Debe pasa a Haber
          saldo: '0.00',
          id_pago: idPago, // Mantener el mismo id_pago para relacionarlos
          usuario: usuario || 'Sistema'
        };
      });

      const { error: errInsertMovs } = await supabase
        .from('movimientoscuenta_motor')
        .insert(nuevosReversosMov);
        
      if (errInsertMovs) throw errInsertMovs;

      // 3. Revertir en medios de pago (Caja, Billetera o Banco)
      // Buscar en caja_motor
      const { data: cajaOrig, error: errCaja } = await supabase
        .from('caja_motor')
        .select('*')
        .eq('id_pago', idPago)
        .eq('tipo', 'INGRESO');
        
      if (errCaja) throw errCaja;
      
      if (cajaOrig && cajaOrig.length > 0) {
        const hhmm = new Date().toTimeString().split(' ')[0].substring(0, 5).replace(':', '');
        const yyyymmdd = fechaHoy.replace(/-/g, '');
        const autoIdTurno = `${yyyymmdd}_${hhmm}_${(usuario || 'USER').toUpperCase()}`;
        
        const nuevosReversosCaja = cajaOrig.map(orig => ({
          fecha: fechaHoy,
          usuario: usuario || 'Sistema',
          recibido_por: orig.recibido_por,
          entregado_por: orig.entregado_por,
          turno: orig.turno,
          id_turno: autoIdTurno,
          tipo: 'EGRESO',
          concepto: `REVERSO Cobranza: ${orig.concepto}`,
          medio_pago: orig.medio_pago,
          importe: orig.importe,
          saldo: '0.00',
          id_pago: idPago,
          observaciones: `Reversión automática de pago ID: ${idPago}`,
          cierre_turno: false
        }));
        
        const { error: errInsertCaja } = await supabase
          .from('caja_motor')
          .insert(nuevosReversosCaja);
          
        if (errInsertCaja) throw errInsertCaja;
      }

      // Buscar en billeteras_motor
      const { data: billOrig, error: errBill } = await supabase
        .from('billeteras_motor')
        .select('*')
        .eq('id_pago', idPago)
        .eq('tipo', 'INGRESO');
        
      if (errBill) throw errBill;
      
      if (billOrig && billOrig.length > 0) {
        const nuevosReversosBill = billOrig.map(orig => ({
          fecha: fechaHoy,
          usuario: usuario || 'Sistema',
          billetera: orig.billetera,
          tipo: 'EGRESO',
          concepto: `REVERSO Cobranza QR: ${orig.concepto}`,
          importe: orig.importe,
          saldo: -orig.importe,
          id_pago: idPago
        }));
        
        const { error: errInsertBill } = await supabase
          .from('billeteras_motor')
          .insert(nuevosReversosBill);
          
        if (errInsertBill) throw errInsertBill;
      }

      // Buscar en bancos_motor
      const { data: bancoOrig, error: errBanco } = await supabase
        .from('bancos_motor')
        .select('*')
        .eq('id_pago', idPago)
        .eq('tipo', 'INGRESO');
        
      if (errBanco) throw errBanco;
      
      if (bancoOrig && bancoOrig.length > 0) {
        const nuevosReversosBanco = bancoOrig.map(orig => ({
          fecha: fechaHoy,
          usuario: usuario || 'Sistema',
          banco: orig.banco,
          tipo: 'EGRESO',
          concepto: `REVERSO Cobranza Transf: ${orig.concepto}`,
          importe: orig.importe,
          saldo: -orig.importe,
          id_pago: idPago
        }));
        
        const { error: errInsertBanco } = await supabase
          .from('bancos_motor')
          .insert(nuevosReversosBanco);
          
        if (errInsertBanco) throw errInsertBanco;
      }

      // 4. Revertir liquidación a prestadores en movprestadores_motor
      const { data: prestadoresOrig, error: errPrestadores } = await supabase
        .from('movprestadores_motor')
        .select('*')
        .eq('id_pago', idPago);
        
      if (errPrestadores) throw errPrestadores;
      
      if (prestadoresOrig && prestadoresOrig.length > 0) {
        const nuevosReversosPrestadores = prestadoresOrig.map(orig => {
          const valDebe = parseFloat(orig.debe) || 0;
          const valHaber = parseFloat(orig.haber) || 0;
          
          return {
            id_prestador: orig.id_prestador,
            id_paciente: orig.id_paciente,
            fecha: fechaHoy,
            id_pago: idPago,
            concepto: `REVERSO ${orig.concepto}`,
            debe: valHaber.toString(), // Lo que estaba en Haber (pago) pasa a Debe
            haber: valDebe.toString(), // Lo que estaba en Debe pasa a Haber
            saldo: '0.00',
            usuario: usuario || 'Sistema',
            acuerdo: orig.acuerdo
          };
        });
        
        const { error: errInsertPrestadores } = await supabase
          .from('movprestadores_motor')
          .insert(nuevosReversosPrestadores);
          
        if (errInsertPrestadores) throw errInsertPrestadores;
      }

      // 5. Marcar como ANULADO en pagos_motor
      const { error: errUpdatePagoMotor } = await supabase
        .from('pagos_motor')
        .update({ estado: 'ANULADO' })
        .eq('id_pago', idPago);

      if (errUpdatePagoMotor) throw errUpdatePagoMotor;

      setMensaje({ texto: "El pago y todas sus distribuciones fueron revertidos correctamente.", tipo: 'exito' });
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
      
      // Recargar la ficha
      seleccionarPacientePorId({ target: { value: pacienteSeleccionado.id_paciente } });
      
    } catch (error) {
      console.error("Error al revertir pago:", error);
      alert("Error al revertir pago: " + error.message);
    } finally {
      setCargando(false);
    }
  };

  const obtenerColorEstado = (estado) => {
    const est = (estado || '').toLowerCase();
    if (est.includes('activo')) return { bg: '#dcfce7', color: '#166534' };
    if (est.includes('finalizado')) return { bg: '#e2e8f0', color: '#334155' };
    if (est.includes('rescindido')) return { bg: '#fee2e2', color: '#991b1b' };
    return { bg: '#fef9c3', color: '#854d0e' };
  };

  const sumaTotalDeuda = deudasAgrupadas.reduce((acc, curr) => acc + curr.saldoReal, 0);

  const totalDebeGeneral = movimientosDetallados.reduce((acc, m) => acc + parsearMoneda(m.debe), 0);
  const totalHaberGeneral = movimientosDetallados.reduce((acc, m) => acc + parsearMoneda(m.haber), 0);
  const saldoFinalGeneral = totalDebeGeneral - totalHaberGeneral;

  const idsPagosRevertidos = new Set(
    movimientosDetallados
      .filter(m => m.subtipo === 'reverso_pago')
      .map(m => m.id_pago)
      .filter(id => id !== null && id !== undefined)
  );

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', background: '#fff', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px' }}>
        <h2 style={{ color: '#1e293b', margin: 0, fontSize: '22px' }}>🗂️ Ficha Integral de Paciente</h2>
        <button
          onClick={onVolver}
          style={{ background: '#64748b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}
        >
          ← Volver al Menú
        </button>
      </div>

      {mensaje.texto && (
        <div style={{ padding: '10px 15px', marginBottom: '20px', borderRadius: '6px', background: mensaje.tipo === 'error' ? '#fee2e2' : '#dcfce7', color: mensaje.tipo === 'error' ? '#991b1b' : '#166534', fontWeight: '500' }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ marginBottom: '25px' }}>
        <label style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
          Seleccionar Paciente (`pacientes_motor`):
        </label>
        <select
          onChange={seleccionarPacientePorId}
          value={pacienteSeleccionado ? pacienteSeleccionado.id_paciente : ''}
          disabled={cargandoPacientes}
          style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '15px', background: '#f8fafc', color: '#0f172a', fontWeight: '500' }}
        >
          <option value="">{cargandoPacientes ? 'Cargando pacientes...' : '-- Seleccioná un paciente --'}</option>
          {listaPacientes.map((p) => (
            <option key={p.id_paciente} value={p.id_paciente}>
              {p.nombre_apellido} {p.dni ? `- DNI: ${p.dni}` : ''} (ID: {p.id_paciente})
            </option>
          ))}
        </select>
      </div>

      {pacienteSeleccionado && (
        <div>
          <div style={{ background: '#f1f5f9', padding: '15px 20px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div>
              <h3 style={{ margin: 0, color: '#0f172a', fontSize: '18px' }}>{pacienteSeleccionado.nombre_apellido}</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                DNI: {pacienteSeleccionado.dni || 'S/D'} | ID Paciente: {pacienteSeleccionado.id_paciente} | Obra Social: {pacienteSeleccionado.obra_social || 'S/D'}
              </p>
            </div>
            <button
              onClick={() => { setPacienteSeleccionado(null); setAcuerdos([]); setDeudasAgrupadas([]); setMovimientosDetallados([]); setVistaActiva('menu'); }}
              style={{ background: 'transparent', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', color: '#475569', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
            >
              Cambiar Paciente
            </button>
          </div>

          {vistaActiva === 'menu' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginTop: '20px', marginBottom: '20px' }}>
              <div 
                onClick={() => setVistaActiva('acuerdos')}
                style={{ border: '2px solid #cbd5e1', borderRadius: '10px', padding: '20px', textAlign: 'center', cursor: 'pointer', background: '#fff', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
              >
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>📋</div>
                <h4 style={{ margin: '0 0 6px 0', color: '#1e293b', fontSize: '15px' }}>Ver y Editar Acuerdos</h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Consultar y modificar importes, vencimientos y estados.</p>
              </div>

              <div 
                onClick={() => setVistaActiva('cuenta_corriente')}
                style={{ border: '2px solid #cbd5e1', borderRadius: '10px', padding: '20px', textAlign: 'center', cursor: 'pointer', background: '#fff', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
              >
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>💰</div>
                <h4 style={{ margin: '0 0 6px 0', color: '#1e293b', fontSize: '15px' }}>Deudas Pendientes</h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Deudas agrupadas sin ceros con su suma total al pie.</p>
              </div>

              <div 
                onClick={() => setVistaActiva('resumen_detallado')}
                style={{ border: '2px solid #2563eb', borderRadius: '10px', padding: '20px', textAlign: 'center', cursor: 'pointer', background: '#eff6ff', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
              >
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>📊</div>
                <h4 style={{ margin: '0 0 6px 0', color: '#1e293b', fontSize: '15px' }}>Resumen Detallado</h4>
                <p style={{ margin: 0, fontSize: '12px', color: '#475569' }}>Todos los movimientos de cuenta (debe, haber y saldos).</p>
              </div>
            </div>
          )}

          {vistaActiva === 'acuerdos' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>
                <h4 style={{ color: '#1e293b', margin: 0 }}>📋 Acuerdos Activos (Sin valor 0)</h4>
                <button
                  onClick={() => setVistaActiva('menu')}
                  style={{ background: '#e2e8f0', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#334155' }}
                >
                  ← Volver al Menú de la Ficha
                </button>
              </div>

              {cargando ? (
                <p style={{ color: '#64748b' }}>Cargando acuerdos...</p>
              ) : acuerdos.length === 0 ? (
                <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                  Este paciente no registra acuerdos con importes distintos de cero en `acuerdos_motor`.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {acuerdos.map((acuerdo) => {
                    const estBadge = obtenerColorEstado(acuerdo.estado);
                    return (
                      <div key={acuerdo.id_acuerdo} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '20px', background: '#fff' }}>
                        <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#2563eb' }}>
                            🩺 Prestación: {acuerdo.nombre_prestacion}
                          </span>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <select
                              value={acuerdo.estado || 'ACTIVO'}
                              onChange={(e) => actualizarAcuerdoEnBD(acuerdo.id_acuerdo, 'estado', e.target.value)}
                              style={{ fontSize: '12px', fontWeight: 'bold', padding: '4px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', background: estBadge.bg, color: estBadge.color, cursor: 'pointer' }}
                            >
                              <option value="ACTIVO">ACTIVO</option>
                              <option value="FINALIZADO">FINALIZADO</option>
                              <option value="RESCINDIDO">RESCINDIDO</option>
                            </select>
                            <span style={{ fontSize: '12px', color: '#64748b' }}>ID: {acuerdo.id_acuerdo}</span>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>
                              Importe Actual ($)
                            </label>
                            <input
                              type="text"
                              defaultValue={acuerdo.importe_actual || ''}
                              onBlur={(e) => actualizarAcuerdoEnBD(acuerdo.id_acuerdo, 'importe_actual', e.target.value)}
                              style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 'bold' }}
                            />
                            <span style={{ fontSize: '11px', color: '#64748b' }}>Clic fuera para guardar</span>
                          </div>

                          <div>
                            <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>
                              Día de Vencimiento
                            </label>
                            <input
                              type="number"
                              defaultValue={acuerdo.dia_vencimiento || ''}
                              onBlur={(e) => actualizarAcuerdoEnBD(acuerdo.id_acuerdo, 'dia_vencimiento', parseInt(e.target.value) || null)}
                              style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
                            />
                            <span style={{ fontSize: '11px', color: '#64748b' }}>Clic fuera para guardar</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {vistaActiva === 'cuenta_corriente' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>
                <h4 style={{ color: '#1e293b', margin: 0 }}>💰 Cuenta Corriente (Deudas Pendientes)</h4>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {deudasAgrupadas.length > 0 && (
                    <button
                      onClick={() => setModalPagoAbierto(true)}
                      style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'background 0.2s' }}
                      onMouseOver={(e) => e.target.style.background = '#059669'}
                      onMouseOut={(e) => e.target.style.background = '#10b981'}
                    >
                      💵 Registrar Pago
                    </button>
                  )}
                  {movimientosDetallados.length > 0 && (
                    <>
                      <button
                        onClick={() => { setTipoAjusteSeleccionado('nota_credito'); setModalAjusteAbierto(true); }}
                        style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'background 0.2s' }}
                        onMouseOver={(e) => e.target.style.background = '#0284c7'}
                        onMouseOut={(e) => e.target.style.background = '#0ea5e9'}
                      >
                        ➕ Nota de Crédito
                      </button>
                      <button
                        onClick={() => { setTipoAjusteSeleccionado('nota_debito'); setModalAjusteAbierto(true); }}
                        style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'background 0.2s' }}
                        onMouseOver={(e) => e.target.style.background = '#d97706'}
                        onMouseOut={(e) => e.target.style.background = '#f59e0b'}
                      >
                        ➖ Nota de Débito
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setVistaActiva('menu')}
                    style={{ background: '#e2e8f0', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#334155' }}
                  >
                    ← Volver al Menú de la Ficha
                  </button>
                </div>
              </div>

              {cargando ? (
                <p style={{ color: '#64748b' }}>Cargando cuenta corriente...</p>
              ) : deudasAgrupadas.length === 0 ? (
                <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                  Este paciente no registra deudas pendientes (sin saldo a cobrar) en este momento.
                </p>
              ) : (
                <div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: '13px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', color: '#334155', borderBottom: '2px solid #cbd5e1' }}>
                          <th style={{ padding: '10px' }}>ID Deuda</th>
                          <th style={{ padding: '10px' }}>Prestación / Acuerdo</th>
                          <th style={{ padding: '10px' }}>Subtipo</th>
                          <th style={{ padding: '10px' }}>Concepto</th>
                          <th style={{ padding: '10px' }}>Vencimiento</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Saldo Pendiente ($)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deudasAgrupadas.map((deuda) => (
                          <tr key={deuda.id_deuda} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a' }}>
                              #{deuda.id_deuda}
                            </td>
                            <td style={{ padding: '10px', fontWeight: '500', color: '#2563eb' }}>
                              {deuda.nombre_prestacion}
                            </td>
                            <td style={{ padding: '10px' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '4px', background: deuda.subtipo === 'cuota_mensual' ? '#e0f2fe' : '#f3e8ff', color: deuda.subtipo === 'cuota_mensual' ? '#0369a1' : '#6b21a8', fontWeight: 'bold', fontSize: '11px' }}>
                                {deuda.subtipo}
                              </span>
                            </td>
                            <td style={{ padding: '10px', fontWeight: 'bold', color: '#334155' }}>
                              {deuda.concepto}
                            </td>
                            <td style={{ padding: '10px', color: '#475569', whiteSpace: 'nowrap' }}>
                              {deuda.fecha_vencimiento}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: deuda.saldoReal > 0 ? '#dc2626' : '#16a34a', fontSize: '14px' }}>
                              ${deuda.saldoReal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1' }}>
                          <td colSpan="5" style={{ padding: '12px 10px', fontWeight: 'bold', color: '#1e293b', textAlign: 'right', fontSize: '14px' }}>
                            Suma Total de Deuda Pendiente:
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626', fontSize: '16px' }}>
                            ${sumaTotalDeuda.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {vistaActiva === 'resumen_detallado' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>
                <h4 style={{ color: '#1e293b', margin: 0 }}>📊 Resumen de Cuenta Detallado (Todos los Movimientos)</h4>
                <button
                  onClick={() => setVistaActiva('menu')}
                  style={{ background: '#e2e8f0', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#334155' }}
                >
                  ← Volver al Menú de la Ficha
                </button>
              </div>

              {cargando ? (
                <p style={{ color: '#64748b' }}>Cargando resumen detallado...</p>
              ) : movimientosDetallados.length === 0 ? (
                <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                  Este paciente no registra movimientos en su cuenta corriente.
                </p>
              ) : (
                <div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: '13px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9', color: '#334155', borderBottom: '2px solid #cbd5e1' }}>
                          <th style={{ padding: '10px' }}>Fecha</th>
                          <th style={{ padding: '10px' }}>Prestación / Acuerdo</th>
                          <th style={{ padding: '10px' }}>Subtipo</th>
                          <th style={{ padding: '10px' }}>Concepto</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Debe ($)</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Haber ($)</th>
                          <th style={{ padding: '10px', textAlign: 'right' }}>Saldo ($)</th>
                          <th style={{ padding: '10px', textAlign: 'center' }}>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          let runningBalance = 0;
                          return movimientosDetallados.map((mov, index) => {
                            const valDebe = parsearMoneda(mov.debe);
                            const valHaber = parsearMoneda(mov.haber);
                            runningBalance = runningBalance + valDebe - valHaber;
                            return (
                              <tr key={mov.id_movimiento || index} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '10px', color: '#475569', whiteSpace: 'nowrap' }}>
                                  {mov.fecha_movimiento || mov.fecha_vencimiento || 'S/D'}
                                </td>
                                <td style={{ padding: '10px', fontWeight: '500', color: '#2563eb' }}>
                                  {mov.nombre_prestacion}
                                </td>
                                <td style={{ padding: '10px' }}>
                                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#f1f5f9', color: '#334155', fontWeight: 'bold', fontSize: '11px' }}>
                                    {mov.subtipo || 'S/D'}
                                  </span>
                                </td>
                                <td style={{ padding: '10px', fontWeight: 'bold', color: '#334155' }}>
                                  {mov.concepto || 'S/D'}
                                </td>
                                <td style={{ padding: '10px', textAlign: 'right', fontWeight: '600', color: valDebe > 0 ? '#dc2626' : '#64748b' }}>
                                  {valDebe > 0 ? `$${valDebe.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                </td>
                                <td style={{ padding: '10px', textAlign: 'right', fontWeight: '600', color: valHaber > 0 ? '#16a34a' : '#64748b' }}>
                                  {valHaber > 0 ? `$${valHaber.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                </td>
                                <td style={{ padding: '10px', textAlign: 'right', fontWeight: '600', color: runningBalance > 0 ? '#dc2626' : runningBalance < 0 ? '#16a34a' : '#64748b' }}>
                                  {`$${runningBalance.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                                </td>
                                <td style={{ padding: '10px', textAlign: 'center' }}>
                                  {mov.id_pago && mov.subtipo !== 'reverso_pago' && !idsPagosRevertidos.has(mov.id_pago) && (
                                    <button
                                      onClick={() => manejarReversionPago(mov.id_pago)}
                                      style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', transition: 'background 0.2s' }}
                                      onMouseOver={(e) => e.target.style.background = '#991b1b'}
                                      onMouseOut={(e) => e.target.style.background = '#dc2626'}
                                    >
                                      Revertir
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1' }}>
                          <td colSpan="4" style={{ padding: '12px 10px', fontWeight: 'bold', color: '#1e293b', textAlign: 'right', fontSize: '14px' }}>
                            Totales Generales / Saldo Final:
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', color: '#dc2626', fontSize: '14px' }}>
                            ${totalDebeGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a', fontSize: '14px' }}>
                            ${totalHaberGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', color: saldoFinalGeneral > 0 ? '#dc2626' : saldoFinalGeneral < 0 ? '#16a34a' : '#64748b', fontSize: '14px' }}>
                            ${saldoFinalGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '10px' }} />
                        </tr>
                        <tr style={{ background: '#f1f5f9' }}>
                          <td colSpan="4" style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a', textAlign: 'right', fontSize: '14px' }}>
                            Saldo Neto (Debe - Haber):
                          </td>
                          <td colSpan="4" style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: saldoFinalGeneral > 0 ? '#dc2626' : '#16a34a', fontSize: '15px' }}>
                            ${saldoFinalGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
      {modalPagoAbierto && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '750px',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            padding: '30px',
            color: '#1e293b',
            maxHeight: '90vh',
            overflowY: 'auto',
            fontFamily: 'Segoe UI, system-ui, sans-serif'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>
                💵 Registrar Pago ({pacienteSeleccionado?.nombre_apellido})
              </h3>
              <button
                onClick={() => setModalPagoAbierto(false)}
                style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: formaPago === 'Efectivo' ? '1fr' : '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
              
              {/* Columna Izquierda: Detalles del Pago */}
              <div>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>
                    Seleccionar Deuda Primaria a Pagar *
                  </label>
                  <select
                    value={deudaSeleccionadaId}
                    onChange={(e) => {
                      setDeudaSeleccionadaId(e.target.value);
                      const seleccionada = deudasAgrupadas.find(d => String(d.id_deuda) === String(e.target.value));
                      if (seleccionada) {
                        setImportePago(seleccionada.saldoReal.toString());
                      }
                    }}
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: '#f8fafc', color: '#0f172a' }}
                  >
                    <option value="">-- Seleccionar Deuda --</option>
                    {deudasAgrupadas.map(d => (
                      <option key={d.id_deuda} value={d.id_deuda}>
                        #{d.id_deuda} - {d.concepto} (Saldo: ${d.saldoReal.toLocaleString('es-AR')})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>
                    Importe a Pagar ($) *
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="number"
                      value={importePago}
                      onChange={(e) => setImportePago(e.target.value)}
                      placeholder="Ej: 290400"
                      style={{ flex: 1, padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold' }}
                    />
                    {deudaSeleccionadaId && (
                      <button
                        type="button"
                        onClick={() => {
                          const seleccionada = deudasAgrupadas.find(d => String(d.id_deuda) === String(deudaSeleccionadaId));
                          if (seleccionada) setImportePago(seleccionada.saldoReal.toString());
                        }}
                        style={{ padding: '8px 12px', background: '#e2e8f0', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', color: '#334155' }}
                      >
                        Pagar Total
                      </button>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginTop: '4px' }}>
                    Si el monto supera la deuda, se aplicará el sobrante en sistema FIFO a otras deudas.
                  </span>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>
                    Fecha de Pago *
                  </label>
                  <input
                    type="date"
                    value={fechaPago}
                    onChange={(e) => setFechaPago(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                  />
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>
                    Forma de Pago *
                  </label>
                  <select
                    value={formaPago}
                    onChange={(e) => setFormaPago(e.target.value)}
                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: '#f8fafc', color: '#0f172a' }}
                  >
                    <option value="Efectivo">Efectivo (Va a Caja)</option>
                    <option value="QR (Mercado Pago)">QR / Mercado Pago (Va a Billetera)</option>
                    <option value="Transferencia / Depósito">Transferencia / Depósito (Va a Banco)</option>
                  </select>
                </div>
              </div>

              {/* Columna Derecha: Campos Condicionales según Medio de Pago (solo si no es Efectivo) */}
              {formaPago !== 'Efectivo' && (
                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 'bold', color: '#334155' }}>
                    ⚙️ Detalles del Destino Financiero
                  </h4>

                  {formaPago === 'QR (Mercado Pago)' && (
                    <div>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#64748b', marginBottom: '4px' }}>
                          Billetera Virtual *
                        </label>
                        <select
                          value={billeteraNombre}
                          onChange={(e) => setBilleteraNombre(e.target.value)}
                          style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                        >
                          <option value="MERCADOPAGO">MERCADOPAGO</option>
                          <option value="MODO">MODO</option>
                          <option value="UALA">UALA</option>
                          <option value="OTRA">OTRA</option>
                        </select>
                      </div>
                    </div>
                  )}

                  {formaPago === 'Transferencia / Depósito' && (
                    <div>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#64748b', marginBottom: '4px' }}>
                          Banco Receptor *
                        </label>
                        <select
                          value={bancoNombre}
                          onChange={(e) => setBancoNombre(e.target.value)}
                          style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                        >
                          <option value="GALICIA">BANCO GALICIA</option>
                          <option value="SANTANDER">BANCO SANTANDER</option>
                          <option value="MACRO">BANCO MACRO</option>
                          <option value="BELO">BELO / DIGITAL</option>
                          <option value="OTRO">OTRO BANCO</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Distribución a Prestadores */}
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px', marginBottom: '25px' }}>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>
                🩺 Distribución de Honorarios a Prestadores
              </h4>
              <p style={{ margin: '0 0 15px 0', fontSize: '12px', color: '#64748b' }}>
                Asigná la cantidad de sesiones dadas por cada profesional para prorratear el importe ingresado.
              </p>

              {cargandoPrestadores ? (
                <p style={{ fontSize: '13px', color: '#64748b' }}>Cargando listado de prestadores...</p>
              ) : prestadoresList.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>No se encontraron prestadores activos en `prestadores_motor`.</p>
              ) : (
                <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '1px solid #cbd5e1' }}>
                        <th style={{ padding: '8px 10px' }}>Prestador</th>
                        <th style={{ padding: '8px 10px' }}>Especialidad</th>
                        <th style={{ padding: '8px 10px', width: '100px', textAlign: 'center' }}>Sesiones</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right' }}>Monto Estimado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {prestadoresList.map(p => {
                        const ses = sesionesPrestadores[p.id_prestador] || 0;
                        const totalSes = Object.values(sesionesPrestadores).reduce((acc, curr) => acc + (parseInt(curr) || 0), 0);
                        const impTotal = parseFloat(importePago) || 0;
                        const estimado = totalSes > 0 ? ((ses / totalSes) * impTotal).toFixed(2) : '0.00';

                        return (
                          <tr key={p.id_prestador} style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '8px 10px', fontWeight: '500', color: '#1e293b' }}>
                              {p.nombre_prestador}
                            </td>
                            <td style={{ padding: '8px 10px', color: '#64748b' }}>
                              {p.especialidad || 'S/D'}
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                              <input
                                type="number"
                                min="0"
                                value={ses}
                                onChange={(e) => {
                                  const val = Math.max(0, parseInt(e.target.value) || 0);
                                  setSesionesPrestadores({
                                    ...sesionesPrestadores,
                                    [p.id_prestador]: val
                                  });
                                }}
                                style={{ width: '60px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', textAlign: 'center' }}
                              />
                            </td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: parseFloat(estimado) > 0 ? '#16a34a' : '#64748b' }}>
                              ${parseFloat(estimado).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Acciones de Modal */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
              <button
                type="button"
                onClick={() => setModalPagoAbierto(false)}
                disabled={procesandoPago}
                style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarRegistroPago}
                disabled={procesandoPago}
                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {procesandoPago ? 'Procesando...' : 'Confirmar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ajuste (Nota de Crédito / Débito) */}
      {modalAjusteAbierto && (() => {
        // Calcular deudas con sus saldos acumulados de movimientosDetallados
        const mapaSaldos = {};
        movimientosDetallados.forEach(m => {
          if (!m.id_deuda) return;
          if (!mapaSaldos[m.id_deuda]) {
            mapaSaldos[m.id_deuda] = {
              id_deuda: m.id_deuda,
              concepto: m.concepto || `Deuda #${m.id_deuda}`,
              debe: 0,
              haber: 0
            };
          }
          mapaSaldos[m.id_deuda].debe += parsearMoneda(m.debe);
          mapaSaldos[m.id_deuda].haber += parsearMoneda(m.haber);
        });
        
        const deudasDisponibles = Object.values(mapaSaldos).map(d => ({
          ...d,
          saldoReal: d.debe - d.haber
        }));

        return (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1100,
            padding: '20px'
          }}>
            <div style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              width: '100%',
              maxWidth: '550px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              padding: '30px',
              color: '#1e293b',
              maxHeight: '90vh',
              overflowY: 'auto',
              fontFamily: 'Segoe UI, system-ui, sans-serif'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>
                  {tipoAjusteSeleccionado === 'nota_credito' ? '➕ Registrar Nota de Crédito' : '➖ Registrar Nota de Débito'}
                </h3>
                <button
                  onClick={() => setModalAjusteAbierto(false)}
                  style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}
                >
                  &times;
                </button>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>
                  Paciente
                </label>
                <input
                  type="text"
                  readOnly
                  value={pacienteSeleccionado?.nombre_apellido || ''}
                  style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: '#f1f5f9', color: '#64748b' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>
                  Seleccionar Deuda a Afectar *
                </label>
                <select
                  value={deudaAjusteId}
                  onChange={(e) => setDeudaAjusteId(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: '#f8fafc', color: '#0f172a' }}
                >
                  <option value="">-- Seleccionar Deuda --</option>
                  {deudasDisponibles.map(d => (
                    <option key={d.id_deuda} value={d.id_deuda}>
                      #{d.id_deuda} - {d.concepto} (Saldo: ${d.saldoReal.toLocaleString('es-AR')})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>
                  Importe del Ajuste ($) *
                </label>
                <input
                  type="number"
                  value={importeAjuste}
                  onChange={(e) => setImporteAjuste(e.target.value)}
                  placeholder="Ej: 5000"
                  style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>
                  Fecha del Ajuste *
                </label>
                <input
                  type="date"
                  value={fechaAjuste}
                  onChange={(e) => setFechaAjuste(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>
                  Concepto *
                </label>
                <input
                  type="text"
                  value={conceptoAjuste}
                  onChange={(e) => setConceptoAjuste(e.target.value)}
                  placeholder="Ej: Bonificación por acuerdo"
                  style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>
                  Observación / Nota interna
                </label>
                <textarea
                  value={observacionAjuste}
                  onChange={(e) => setObservacionAjuste(e.target.value)}
                  placeholder="Escriba aquí los detalles o justificación de la nota..."
                  rows="3"
                  style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>

              {/* Acciones de Modal */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => setModalAjusteAbierto(false)}
                  disabled={procesandoAjuste}
                  style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarRegistroAjuste}
                  disabled={procesandoAjuste}
                  style={{
                    background: tipoAjusteSeleccionado === 'nota_credito' ? '#0ea5e9' : '#f59e0b',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 20px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '600'
                  }}
                >
                  {procesandoAjuste ? 'Procesando...' : 'Confirmar Nota'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

        </div>
      )}

    </div>
  );
}