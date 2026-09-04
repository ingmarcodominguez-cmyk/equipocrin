import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const parsearDecimal = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const str = String(val).trim().replace(',', '.');
  const num = Number.parseFloat(str);
  return isNaN(num) ? 0 : num;
};

export default function AsistenciaAuxiliares({ onVolver, usuario }) {
  const [pestañaActiva, setPestañaActiva] = useState('asistencia_diaria'); // 'asistencia_diaria', 'auxiliares', 'historial'
  const [fechaTrabajo, setFechaTrabajo] = useState('');
  
  // Maestros de Auxiliares
  const [auxiliares, setAuxiliares] = useState([]);
  const [cargandoAuxiliares, setCargandoAuxiliares] = useState(false);

  // Registro de Asistencias del Día
  const [asistenciasDia, setAsistenciasDia] = useState([]);
  const [cargandoAsistencias, setCargandoAsistencias] = useState(false);

  // Historial Completo
  const [historialCompleto, setHistorialCompleto] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // Estados para Modales/Formularios de Asistencia
  const [modalAsistenciaAbierto, setModalAsistenciaAbierto] = useState(false);
  const [auxiliarSeleccionadoAsist, setAuxiliarSeleccionadoAsist] = useState(null);
  const [registroEdicion, setRegistroEdicion] = useState(null); // Si estamos editando uno existente
  
  // Campos del formulario de asistencia
  const [tipoLiq, setTipoLiq] = useState('HORA');
  const [horaEntradaM, setHoraEntradaM] = useState('');
  const [horaSalidaM, setHoraSalidaM] = useState('');
  const [horaEntradaT, setHoraEntradaT] = useState('');
  const [horaSalidaT, setHoraSalidaT] = useState('');
  const [horasTrabajadas, setHorasTrabajadas] = useState('');
  const [sesiones, setSesiones] = useState('0');
  const [valorHora, setValorHora] = useState('');
  const [valorSesion, setValorSesion] = useState('');
  const [obs, setObs] = useState('');
  const [prestadores, setPrestadores] = useState([]);
  const [prestadorM1, setPrestadorM1] = useState('');
  const [shareM1, setShareM1] = useState('1');
  const [prestadorM2, setPrestadorM2] = useState('');
  const [shareM2, setShareM2] = useState('');

  const [prestadorT1, setPrestadorT1] = useState('');
  const [shareT1, setShareT1] = useState('1');
  const [prestadorT2, setPrestadorT2] = useState('');
  const [shareT2, setShareT2] = useState('');
  const [guardandoAsist, setGuardandoAsist] = useState(false);

  // Estados para Modal/Formulario de ABM Auxiliar
  const [modalAuxiliarAbierto, setModalAuxiliarAbierto] = useState(false);
  const [auxiliarAEditar, setAuxiliarAEditar] = useState(null);
  const [nombreAux, setNombreAux] = useState('');
  const [tipoLiqAux, setTipoLiqAux] = useState('HORA');
  const [valorHoraAux, setValorHoraAux] = useState('');
  const [valorSesionAux, setValorSesionAux] = useState('');
  const [guardandoAux, setGuardandoAux] = useState(false);

  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  const [filtroNombre, setFiltroNombre] = useState('');

  // Estados para cruce y selección de Pacientes en modalidad SESION
  const [listaPacientesMaestro, setListaPacientesMaestro] = useState([]);
  const [mapaPacientes, setMapaPacientes] = useState({});
  const [asistenciasPacientesFecha, setAsistenciasPacientesFecha] = useState({});
  const [pacientesSeleccionadosSesion, setPacientesSeleccionadosSesion] = useState([]);
  const [modalSeleccionPacientesAbierto, setModalSeleccionPacientesAbierto] = useState(false);
  const [busquedaPacModal, setBusquedaPacModal] = useState('');
  const [filtroMatchPac, setFiltroMatchPac] = useState('TODOS'); // 'TODOS', 'MATCH', 'NOMATCH', 'SELECCIONADOS'
  const [cargandoCrucePacientes, setCargandoCrucePacientes] = useState(false);
  const [actualizandoAsistPacId, setActualizandoAsistPacId] = useState(null);
  const [notificacionModalPac, setNotificacionModalPac] = useState(null);

  const cargarPrestadores = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, nombre')
        .order('nombre', { ascending: true });
      if (error) throw error;
      setPrestadores(data || []);
    } catch (err) {
      console.error("Error al cargar prestadores:", err);
    }
  };

  const cargarPacientesMaestro = async () => {
    try {
      const { data, error } = await supabase
        .from('pacientes_motor')
        .select('id_paciente, nombre_apellido, dni, estado')
        .order('nombre_apellido', { ascending: true });
      if (error) throw error;
      const list = data || [];
      setListaPacientesMaestro(list);
      const mapa = {};
      list.forEach(p => {
        mapa[p.id_paciente] = p;
      });
      setMapaPacientes(mapa);
    } catch (err) {
      console.error("Error al cargar pacientes maestro:", err);
    }
  };

  const cargarAsistenciasPacientesFecha = async (fechaAUsar) => {
    if (!fechaAUsar) return;
    setCargandoCrucePacientes(true);
    try {
      const { data, error } = await supabase
        .from('asistencia_pacientes_motor')
        .select('id_paciente, paciente_nombre, estado')
        .eq('fecha', fechaAUsar);
      if (error) throw error;
      const mapa = {};
      (data || []).forEach(a => {
        mapa[a.id_paciente] = a.estado; // 'Presente', 'Ausente con Aviso', 'Ausente sin Aviso', 'Pendiente'
      });
      setAsistenciasPacientesFecha(mapa);
    } catch (err) {
      console.error("Error al cargar asistencias de pacientes para fecha:", err);
    } finally {
      setCargandoCrucePacientes(false);
    }
  };

  // Corregir la asistencia del paciente directamente en BD para que figure Presente
  const marcarPacientePresenteEnBD = async (paciente, e) => {
    if (e && e.stopPropagation) e.stopPropagation();

    setActualizandoAsistPacId(paciente.id_paciente);
    try {
      const fechaAUsar = registroEdicion?.fecha || fechaTrabajo;

      // 1. Verificar si ya existe registro en asistencia_pacientes_motor para esta fecha y paciente
      const { data: existente, error: errCheck } = await supabase
        .from('asistencia_pacientes_motor')
        .select('id_asistencia')
        .eq('fecha', fechaAUsar)
        .eq('id_paciente', paciente.id_paciente)
        .maybeSingle();

      if (errCheck) throw errCheck;

      if (existente && existente.id_asistencia) {
        // Actualizar estado a Presente
        const { error: errUpd } = await supabase
          .from('asistencia_pacientes_motor')
          .update({
            estado: 'Presente',
            fecha_registro: new Date().toISOString()
          })
          .eq('id_asistencia', existente.id_asistencia);
        if (errUpd) throw errUpd;
      } else {
        // Insertar nuevo registro con estado Presente
        const { error: errIns } = await supabase
          .from('asistencia_pacientes_motor')
          .insert([{
            fecha: fechaAUsar,
            id_paciente: paciente.id_paciente,
            paciente_nombre: paciente.nombre_apellido,
            estado: 'Presente',
            obs: 'Presente confirmado desde Asistencia Auxiliares',
            usuario: 'Coordinación',
            fecha_registro: new Date().toISOString()
          }]);
        if (errIns) throw errIns;
      }

      // 2. Actualizar estado local inmediato del mapa de asistencias
      setAsistenciasPacientesFecha(prev => ({
        ...prev,
        [paciente.id_paciente]: 'Presente'
      }));

      // 3. Tildar/seleccionar automáticamente al paciente para las sesiones del auxiliar
      setPacientesSeleccionadosSesion(prev => {
        if (!prev.includes(paciente.id_paciente)) {
          const updated = [...prev, paciente.id_paciente];
          setSesiones(String(updated.length));
          return updated;
        }
        return prev;
      });

      setNotificacionModalPac({
        texto: `✓ ¡Asistencia de ${paciente.nombre_apellido} guardada como PRESENTE en la planilla del día!`,
        tipo: 'exito'
      });
      setTimeout(() => setNotificacionModalPac(null), 4000);

      mostrarAlerta(`✓ Asistencia de ${paciente.nombre_apellido} actualizada a Presente en la fecha ${fechaAUsar}.`, "exito");
    } catch (err) {
      console.error("Error al actualizar asistencia del paciente:", err);
      alert("Error al actualizar asistencia del paciente: " + err.message);
    } finally {
      setActualizandoAsistPacId(null);
    }
  };

  const parsearPacientesObs = (obsText) => {
    if (!obsText) return [];
    const matchP = obsText.match(/\[PACS:\s*([^\]]+)\]/);
    if (!matchP) return [];
    return matchP[1]
      .split(',')
      .map(idStr => Number(idStr.trim()))
      .filter(id => !isNaN(id) && id > 0);
  };

  const parsearPrestadoresObs = (obsText) => {
    let pM1 = '';
    let sM1 = '1';
    let pM2 = '';
    let sM2 = '';
    
    let pT1 = '';
    let sT1 = '1';
    let pT2 = '';
    let sT2 = '';
    let pacsIds = [];
    
    let limpiaObs = obsText || '';
    
    if (limpiaObs) {
      const matchP = limpiaObs.match(/\[PACS:\s*([^\]]+)\]/);
      if (matchP) {
        pacsIds = matchP[1]
          .split(',')
          .map(idStr => Number(idStr.trim()))
          .filter(id => !isNaN(id) && id > 0);
        limpiaObs = limpiaObs.replace(matchP[0], '');
      }

      const matchM = limpiaObs.match(/\[P_M:\s*([^\]]+)\]/);
      if (matchM) {
        const parts = matchM[1].split(',').map(p => p.trim());
        if (parts[0]) {
          const [name, share] = parts[0].split('|');
          pM1 = name || '';
          sM1 = share || '1';
        }
        if (parts[1]) {
          const [name, share] = parts[1].split('|');
          pM2 = name || '';
          sM2 = share || '1';
        }
        limpiaObs = limpiaObs.replace(matchM[0], '');
      }
      
      const matchT = limpiaObs.match(/\[P_T:\s*([^\]]+)\]/);
      if (matchT) {
        const parts = matchT[1].split(',').map(p => p.trim());
        if (parts[0]) {
          const [name, share] = parts[0].split('|');
          pT1 = name || '';
          sT1 = share || '1';
        }
        if (parts[1]) {
          const [name, share] = parts[1].split('|');
          pT2 = name || '';
          sT2 = share || '1';
        }
        limpiaObs = limpiaObs.replace(matchT[0], '');
      }
      
      limpiaObs = limpiaObs.trim();
    }
    
    return {
      prestadorM1: pM1, shareM1: sM1, prestadorM2: pM2, shareM2: sM2,
      prestadorT1: pT1, shareT1: sT1, prestadorT2: pT2, shareT2: sT2,
      pacsIds,
      limpiaObs
    };
  };

  const componerObsConPrestadores = (pM1, sM1, pM2, sM2, pT1, sT1, pT2, sT2, observacionesTexto, pacsIds = []) => {
    let resultado = '';

    if (pacsIds && pacsIds.length > 0) {
      resultado += `[PACS: ${pacsIds.join(',')}] `;
    }
    
    if (pM1) {
      let tag = `[P_M: ${pM1}|${sM1 || '1'}`;
      if (pM2) {
        tag += `, ${pM2}|${sM2 || '1'}`;
      }
      tag += '] ';
      resultado += tag;
    }
    
    if (pT1) {
      let tag = `[P_T: ${pT1}|${sT1 || '1'}`;
      if (pT2) {
        tag += `, ${pT2}|${sT2 || '1'}`;
      }
      tag += '] ';
      resultado += tag;
    }
    
    if (observacionesTexto && observacionesTexto.trim()) {
      resultado += `${observacionesTexto.trim()}`;
    }
    
    return resultado.trim();
  };

  const formatearPrestadoresDisplay = (p1, s1, p2, s2) => {
    if (!p1) return null;
    if (!p2) return `👤 Aux: ${p1}`;
    
    const num1 = parseFloat(s1) || 1;
    const num2 = parseFloat(s2) || 1;
    const total = num1 + num2;
    const pct1 = Math.round((num1 / total) * 100);
    const pct2 = 100 - pct1;
    
    return `👤 Aux: ${p1} (${pct1}%) / ${p2} (${pct2}%)`;
  };

  // Inicializar fecha
  useEffect(() => {
    const fSimulada = localStorage.getItem('crin_fecha_trabajo_simulada');
    setFechaTrabajo(fSimulada || new Date().toISOString().split('T')[0]);
    cargarPrestadores();
    cargarPacientesMaestro();
  }, []);

  // Carga inicial y cada vez que cambia la fecha de trabajo
  useEffect(() => {
    if (fechaTrabajo) {
      cargarAuxiliares();
      cargarAsistenciasDia();
      cargarAsistenciasPacientesFecha(fechaTrabajo);
    }
  }, [fechaTrabajo]);

  useEffect(() => {
    if (pestañaActiva === 'historial') {
      cargarHistorial();
    }
  }, [pestañaActiva]);

  // Recalcular horas automáticamente al cambiar las entradas/salidas
  useEffect(() => {
    const calculada = calcularDiferenciaHoras(horaEntradaM, horaSalidaM, horaEntradaT, horaSalidaT);
    if (calculada) {
      setHorasTrabajadas(calculada);
    }
  }, [horaEntradaM, horaSalidaM, horaEntradaT, horaSalidaT]);

  const mostrarAlerta = (texto, tipo) => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
  };

  // Cargar auxiliares
  const cargarAuxiliares = async () => {
    setCargandoAuxiliares(true);
    try {
      const { data, error } = await supabase
        .from('auxiliares_motor')
        .select('*')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setAuxiliares(data || []);
    } catch (error) {
      console.error("Error al cargar auxiliares:", error);
      mostrarAlerta("Error al obtener auxiliares: " + error.message, "error");
    } finally {
      setCargandoAuxiliares(false);
    }
  };

  // Cargar asistencias del día seleccionado
  const cargarAsistenciasDia = async () => {
    setCargandoAsistencias(true);
    try {
      const { data, error } = await supabase
        .from('asistencia_auxiliares_motor')
        .select('*')
        .eq('fecha', fechaTrabajo);

      if (error) throw error;
      setAsistenciasDia(data || []);
    } catch (error) {
      console.error("Error al cargar asistencias del día:", error);
      mostrarAlerta("Error al cargar asistencias del día.", "error");
    } finally {
      setCargandoAsistencias(false);
    }
  };

  // Cargar historial completo
  const cargarHistorial = async () => {
    setCargandoHistorial(true);
    try {
      const { data, error } = await supabase
        .from('asistencia_auxiliares_motor')
        .select('*')
        .order('fecha', { ascending: false })
        .order('nombre', { ascending: true });

      if (error) throw error;
      setHistorialCompleto(data || []);
    } catch (error) {
      console.error("Error al cargar historial:", error);
      mostrarAlerta("Error al cargar historial.", "error");
    } finally {
      setCargandoHistorial(false);
    }
  };

  // Helper para calcular horas trabajadas
  const calcularDiferenciaHoras = (entM, salM, entT, salT) => {
    let minsTotal = 0;
    
    if (entM && salM) {
      const [hEnt, mEnt] = entM.split(':').map(Number);
      const [hSal, mSal] = salM.split(':').map(Number);
      if (!isNaN(hEnt) && !isNaN(hSal)) {
        const diff = (hSal * 60 + mSal) - (hEnt * 60 + mEnt);
        if (diff > 0) minsTotal += diff;
      }
    }
    
    if (entT && salT) {
      const [hEnt, mEnt] = entT.split(':').map(Number);
      const [hSal, mSal] = salT.split(':').map(Number);
      if (!isNaN(hEnt) && !isNaN(hSal)) {
        const diff = (hSal * 60 + mSal) - (hEnt * 60 + mEnt);
        if (diff > 0) minsTotal += diff;
      }
    }
    
    if (minsTotal <= 0) return '';
    const hs = Math.round((minsTotal / 60) * 100) / 100;
    return hs.toString();
  };

  // Abrir formulario para registrar/editar asistencia
  const abrirFormularioAsistencia = (auxiliar, registroExistente = null) => {
    setAuxiliarSeleccionadoAsist(auxiliar);
    setRegistroEdicion(registroExistente);

    const fechaAUsar = registroExistente ? registroExistente.fecha : fechaTrabajo;
    cargarAsistenciasPacientesFecha(fechaAUsar);

    let pacsIds = [];
    if (registroExistente) {
      setTipoLiq(registroExistente.tipo_liq || 'HORA');
      setHoraEntradaM(registroExistente.hora_entrada_m ? registroExistente.hora_entrada_m.substring(0, 5) : '');
      setHoraSalidaM(registroExistente.hora_salida_m ? registroExistente.hora_salida_m.substring(0, 5) : '');
      setHoraEntradaT(registroExistente.hora_entrada_t ? registroExistente.hora_entrada_t.substring(0, 5) : '');
      setHoraSalidaT(registroExistente.hora_salida_t ? registroExistente.hora_salida_t.substring(0, 5) : '');
      setHorasTrabajadas(registroExistente.horas_trabajadas || '');
      setSesiones(registroExistente.sesiones ? String(registroExistente.sesiones) : '0');
      setValorHora(registroExistente.valor_hora ? String(registroExistente.valor_hora) : '');
      setValorSesion(registroExistente.valor_sesion ? String(registroExistente.valor_sesion) : '');
      
      const parsed = parsearPrestadoresObs(registroExistente.obs);
      pacsIds = parsed.pacsIds || [];
      setPrestadorM1(parsed.prestadorM1);
      setShareM1(parsed.shareM1 || '1');
      setPrestadorM2(parsed.prestadorM2);
      setShareM2(parsed.shareM2);
      
      setPrestadorT1(parsed.prestadorT1);
      setShareT1(parsed.shareT1 || '1');
      setPrestadorT2(parsed.prestadorT2);
      setShareT2(parsed.shareT2);
      
      setObs(parsed.limpiaObs);
    } else {
      setTipoLiq(auxiliar.tipo_liq || 'HORA');
      setHoraEntradaM('');
      setHoraSalidaM('');
      setHoraEntradaT('');
      setHoraSalidaT('');
      setHorasTrabajadas('');
      setSesiones('0');
      setValorHora(auxiliar.valor_hora ? String(auxiliar.valor_hora) : '');
      setValorSesion(auxiliar.valor_sesion ? String(auxiliar.valor_sesion) : '');
      
      setPrestadorM1('');
      setShareM1('1');
      setPrestadorM2('');
      setShareM2('');
      
      setPrestadorT1('');
      setShareT1('1');
      setPrestadorT2('');
      setShareT2('');
      
      setObs('');
    }

    setPacientesSeleccionadosSesion(pacsIds);
    setBusquedaPacModal('');
    setFiltroMatchPac('TODOS');
    setModalAsistenciaAbierto(true);

    const esModoSesion = registroExistente ? (registroExistente.tipo_liq === 'SESION') : (auxiliar.tipo_liq === 'SESION');
    if (esModoSesion) {
      setModalSeleccionPacientesAbierto(true);
    }
  };

  // Guardar asistencia en base de datos
  const guardarAsistencia = async () => {
    if (tipoLiq === 'HORA' && !horasTrabajadas) {
      alert("Por favor configure las horas trabajadas o ingrese los horarios.");
      return;
    }
    if (tipoLiq === 'SESION' && (isNaN(parsearDecimal(sesiones)) || parsearDecimal(sesiones) <= 0)) {
      alert("Por favor ingrese una cantidad válida de sesiones.");
      return;
    }

    setGuardandoAsist(true);
    try {
      let idRegInsert = null;

      if (registroEdicion) {
        idRegInsert = registroEdicion.id_registro;
      } else {
        // Consultar el próximo id_registro manual para evitar errores de secuencia
        const { data: maxRegData, error: errMaxReg } = await supabase
          .from('asistencia_auxiliares_motor')
          .select('id_registro')
          .order('id_registro', { ascending: false })
          .limit(1);

        if (errMaxReg) throw errMaxReg;
        idRegInsert = (maxRegData && maxRegData[0]?.id_registro ? maxRegData[0].id_registro : 0) + 1;
      }

      const registroInsert = {
        id_registro: idRegInsert,
        fecha: fechaTrabajo,
        id_auxiliar: auxiliarSeleccionadoAsist.id_auxiliar,
        nombre: auxiliarSeleccionadoAsist.nombre,
        tipo_liq: tipoLiq,
        hora_entrada_m: horaEntradaM || null,
        hora_salida_m: horaSalidaM || null,
        hora_entrada_t: horaEntradaT || null,
        hora_salida_t: horaSalidaT || null,
        horas_trabajadas: tipoLiq === 'HORA' ? horasTrabajadas : null,
        sesiones: tipoLiq === 'SESION' ? parsearDecimal(sesiones) : null,
        valor_hora: valorHora ? parsearDecimal(valorHora) : 0,
        valor_sesion: valorSesion ? parsearDecimal(valorSesion) : 0,
        obs: componerObsConPrestadores(
          prestadorM1, shareM1, prestadorM2, shareM2,
          prestadorT1, shareT1, prestadorT2, shareT2,
          obs,
          tipoLiq === 'SESION' ? pacientesSeleccionadosSesion : []
        ) || null,
        fecha_registro: new Date().toISOString()
      };

      const { error } = await supabase
        .from('asistencia_auxiliares_motor')
        .upsert([registroInsert]);

      if (error) throw error;

      mostrarAlerta("Asistencia registrada exitosamente.", "exito");
      setModalAsistenciaAbierto(false);
      cargarAsistenciasDia();
    } catch (error) {
      console.error("Error al registrar asistencia:", error);
      alert("Error al registrar asistencia: " + error.message);
    } finally {
      setGuardandoAsist(false);
    }
  };

  // Eliminar un registro de asistencia
  const eliminarAsistencia = async (idRegistro) => {
    if (!window.confirm("¿Está seguro de que desea eliminar este registro de asistencia?")) return;

    try {
      const { error } = await supabase
        .from('asistencia_auxiliares_motor')
        .delete()
        .eq('id_registro', idRegistro);

      if (error) throw error;

      mostrarAlerta("Registro de asistencia eliminado.", "exito");
      cargarAsistenciasDia();
    } catch (error) {
      console.error("Error al eliminar asistencia:", error);
      alert("Error al eliminar asistencia: " + error.message);
    }
  };

  // Abrir modal de ABM Auxiliar
  const abrirFormularioAuxiliar = (aux = null) => {
    setAuxiliarAEditar(aux);
    if (aux) {
      setNombreAux(aux.nombre || '');
      setTipoLiqAux(aux.tipo_liq || 'HORA');
      setValorHoraAux(aux.valor_hora ? String(aux.valor_hora) : '');
      setValorSesionAux(aux.valor_sesion ? String(aux.valor_sesion) : '');
    } else {
      setNombreAux('');
      setTipoLiqAux('HORA');
      setValorHoraAux('');
      setValorSesionAux('');
    }
    setModalAuxiliarAbierto(true);
  };

  // Guardar auxiliar en auxiliares_motor
  const guardarAuxiliar = async () => {
    if (!nombreAux.trim()) {
      alert("Por favor ingrese el nombre del auxiliar.");
      return;
    }

    setGuardandoAux(true);
    try {
      let idAuxInsert = null;

      if (auxiliarAEditar) {
        idAuxInsert = auxiliarAEditar.id_auxiliar;
      } else {
        const { data: maxAuxData, error: errMaxAux } = await supabase
          .from('auxiliares_motor')
          .select('id_auxiliar')
          .order('id_auxiliar', { ascending: false })
          .limit(1);

        if (errMaxAux) throw errMaxAux;
        idAuxInsert = (maxAuxData && maxAuxData[0]?.id_auxiliar ? maxAuxData[0].id_auxiliar : 0) + 1;
      }

      const auxiliar = {
        id_auxiliar: idAuxInsert,
        nombre: nombreAux.toUpperCase(),
        tipo_liq: tipoLiqAux,
        valor_hora: tipoLiqAux === 'HORA' ? parsearDecimal(valorHoraAux) || 0 : null,
        valor_sesion: tipoLiqAux === 'SESION' ? parsearDecimal(valorSesionAux) || 0 : null,
        fecha_registro: new Date().toISOString()
      };

      const { error } = await supabase
        .from('auxiliares_motor')
        .upsert([auxiliar]);

      if (error) throw error;

      mostrarAlerta("Auxiliar guardado correctamente.", "exito");
      setModalAuxiliarAbierto(false);
      cargarAuxiliares();
    } catch (error) {
      console.error("Error al guardar auxiliar:", error);
      alert("Error al guardar auxiliar: " + error.message);
    } finally {
      setGuardandoAux(false);
    }
  };

  // Eliminar auxiliar de auxiliares_motor
  const eliminarAuxiliar = async (idAuxiliar) => {
    if (!window.confirm("¿Está seguro de que desea eliminar este auxiliar? Esto no borrará sus asistencias anteriores, pero ya no aparecerá en la planilla diaria.")) return;

    try {
      const { error } = await supabase
        .from('auxiliares_motor')
        .delete()
        .eq('id_auxiliar', idAuxiliar);

      if (error) throw error;

      mostrarAlerta("Auxiliar eliminado de la planilla.", "exito");
      cargarAuxiliares();
    } catch (error) {
      console.error("Error al eliminar auxiliar:", error);
      alert("Error al eliminar auxiliar: " + error.message);
    }
  };

  // Mapeo rápido de asistencias por id_auxiliar para la vista diaria
  const mapaAsistencias = {};
  asistenciasDia.forEach(a => {
    mapaAsistencias[a.id_auxiliar] = a;
  });

  // Lógica de cálculo y filtrado para el modal de pacientes (cruce SESION)
  const togglePacienteSeleccionado = (idPaciente) => {
    setPacientesSeleccionadosSesion(prev => {
      const exists = prev.includes(idPaciente);
      const updated = exists ? prev.filter(id => id !== idPaciente) : [...prev, idPaciente];
      setSesiones(String(updated.length));
      return updated;
    });
  };

  const listaFiltradaPacientesCruce = listaPacientesMaestro.filter(p => {
    const q = busquedaPacModal.trim().toLowerCase();
    const matchTexto = !q ||
      (p.nombre_apellido && p.nombre_apellido.toLowerCase().includes(q)) ||
      (p.dni && String(p.dni).includes(q));
    
    if (!matchTexto) return false;

    const estAsist = asistenciasPacientesFecha[p.id_paciente];
    const esMatch = estAsist === 'Presente';
    const isSelected = pacientesSeleccionadosSesion.includes(p.id_paciente);

    if (filtroMatchPac === 'MATCH') return esMatch;
    if (filtroMatchPac === 'NOMATCH') return !esMatch;
    if (filtroMatchPac === 'SELECCIONADOS') return isSelected;
    return true;
  });

  const totalMatchCount = listaPacientesMaestro.filter(p => asistenciasPacientesFecha[p.id_paciente] === 'Presente').length;
  const totalNoMatchCount = listaPacientesMaestro.length - totalMatchCount;

  const seleccionadosMatchCount = pacientesSeleccionadosSesion.filter(id => asistenciasPacientesFecha[id] === 'Presente').length;
  const seleccionadosNoMatchCount = pacientesSeleccionadosSesion.length - seleccionadosMatchCount;

  return (
    <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', fontFamily: 'Segoe UI, system-ui, sans-serif', color: '#1e293b' }}>
      
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '18px', marginBottom: '25px' }}>
        <div>
          <h2 style={{ color: '#0f172a', margin: 0, fontSize: '22px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📋🤝 Asistencia de Auxiliares
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Registrá ingresos, salidas, horas y sesiones trabajadas del personal auxiliar.</p>
        </div>
        <button
          onClick={onVolver}
          style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569', transition: 'background 0.2s' }}
          onMouseOver={(e) => e.target.style.background = '#e2e8f0'}
          onMouseOut={(e) => e.target.style.background = '#f1f5f9'}
        >
          ← Volver al Menú
        </button>
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

      {/* Tabs y Controles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px', gap: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px', background: '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
          <button
            onClick={() => { setPestañaActiva('asistencia_diaria'); setFiltroNombre(''); }}
            style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', background: pestañaActiva === 'asistencia_diaria' ? '#fff' : 'transparent', color: pestañaActiva === 'asistencia_diaria' ? '#0f172a' : '#64748b', boxShadow: pestañaActiva === 'asistencia_diaria' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
          >
            📅 Planilla Diaria
          </button>
          <button
            onClick={() => { setPestañaActiva('auxiliares'); setFiltroNombre(''); }}
            style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', background: pestañaActiva === 'auxiliares' ? '#fff' : 'transparent', color: pestañaActiva === 'auxiliares' ? '#0f172a' : '#64748b', boxShadow: pestañaActiva === 'auxiliares' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
          >
            👥 Gestión de Auxiliares
          </button>
          <button
            onClick={() => { setPestañaActiva('historial'); setFiltroNombre(''); }}
            style={{ padding: '8px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', background: pestañaActiva === 'historial' ? '#fff' : 'transparent', color: pestañaActiva === 'historial' ? '#0f172a' : '#64748b', boxShadow: pestañaActiva === 'historial' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}
          >
            📜 Historial General
          </button>
        </div>

        {pestañaActiva === 'asistencia_diaria' && (
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Fecha:</span>
              <input
                type="date"
                value={fechaTrabajo}
                onChange={(e) => setFechaTrabajo(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: '600' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>🔍 Filtrar Auxiliar:</span>
              <input
                type="text"
                placeholder="Escribe el nombre..."
                value={filtroNombre}
                onChange={(e) => setFiltroNombre(e.target.value)}
                style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '180px', background: '#fff', color: '#1e293b' }}
              />
            </div>
            <button
              onClick={() => abrirFormularioAuxiliar()}
              style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.background = '#2563eb'}
              onMouseOut={(e) => e.target.style.background = '#3b82f6'}
            >
              ➕ Nuevo Auxiliar
            </button>
          </div>
        )}

        {pestañaActiva === 'auxiliares' && (
          <button
            onClick={() => abrirFormularioAuxiliar()}
            style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ➕ Registrar Auxiliar Nuevo
          </button>
        )}

        {pestañaActiva === 'historial' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>🔍 Filtrar por Auxiliar:</span>
            <input
              type="text"
              placeholder="Escribe el nombre..."
              value={filtroNombre}
              onChange={(e) => setFiltroNombre(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', width: '180px', background: '#fff', color: '#1e293b' }}
            />
          </div>
        )}
      </div>

      {/* ==================== VISTA 1: PLANILLA DIARIA ==================== */}
      {pestañaActiva === 'asistencia_diaria' && (
        <div>
          {cargandoAuxiliares || cargandoAsistencias ? (
            <p style={{ color: '#64748b', fontSize: '14px' }}>Cargando planilla diaria...</p>
          ) : auxiliares.length === 0 ? (
            <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '30px', borderRadius: '12px', textAlign: 'center' }}>
              No hay auxiliares registrados en la base de datos. Diríjase a la pestaña "Gestión de Auxiliares" para cargar personal.
            </p>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '12px 10px' }}>Auxiliar</th>
                    <th style={{ padding: '12px 10px' }}>Tipo Liq.</th>
                    <th style={{ padding: '12px 10px' }}>Mañana (Ent / Sal)</th>
                    <th style={{ padding: '12px 10px' }}>Tarde (Ent / Sal)</th>
                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>Horas / Sesiones</th>
                    <th style={{ padding: '12px 10px' }}>Tarifa Activa</th>
                    <th style={{ padding: '12px 10px' }}>Observaciones</th>
                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>Estado / Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {auxiliares
                    .filter(aux => (aux.nombre || '').toLowerCase().includes(filtroNombre.toLowerCase()))
                    .flatMap(aux => {
                      const asists = asistenciasDia.filter(a => a.id_auxiliar === aux.id_auxiliar);
                      if (asists.length === 0) {
                        return [{ aux, asist: null, showAddButton: true }];
                      } else {
                        return asists.map((asist, idx) => ({
                          aux,
                          asist,
                          showAddButton: idx === asists.length - 1
                        }));
                      }
                    })
                    .map(({ aux, asist, showAddButton }, idxFlat) => {
                      const rowKey = asist ? `asist-${asist.id_registro}` : `aux-${aux.id_auxiliar}`;
                      return (
                        <tr key={rowKey} style={{ borderBottom: '1px solid #e2e8f0', background: asist ? '#f0fdf4' : '#fff' }}>
                          <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#1e293b' }}>
                            👤 {aux.nombre}
                          </td>
                          <td style={{ padding: '12px 10px' }}>
                            <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                              {asist ? asist.tipo_liq : aux.tipo_liq}
                            </span>
                          </td>
                          
                          {asist ? (() => {
                            const parsed = parsearPrestadoresObs(asist.obs);
                            const displayM = formatearPrestadoresDisplay(parsed.prestadorM1, parsed.shareM1, parsed.prestadorM2, parsed.shareM2);
                            const displayT = formatearPrestadoresDisplay(parsed.prestadorT1, parsed.shareT1, parsed.prestadorT2, parsed.shareT2);
                            return (
                              <>
                                <td style={{ padding: '12px 10px', color: '#334155' }}>
                                  🌅 {asist.hora_entrada_m ? `${asist.hora_entrada_m.substring(0, 5)} a ${asist.hora_salida_m ? asist.hora_salida_m.substring(0, 5) : '?'}` : '-'}
                                  {displayM && <div style={{ fontSize: '11px', color: '#6b21a8', fontWeight: 'bold', marginTop: '2px' }}>{displayM}</div>}
                                </td>
                                <td style={{ padding: '12px 10px', color: '#334155' }}>
                                  🌆 {asist.hora_entrada_t ? `${asist.hora_entrada_t.substring(0, 5)} a ${asist.hora_salida_t ? asist.hora_salida_t.substring(0, 5) : '?'}` : '-'}
                                  {displayT && <div style={{ fontSize: '11px', color: '#6b21a8', fontWeight: 'bold', marginTop: '2px' }}>{displayT}</div>}
                                </td>
                                <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', color: '#0f172a' }}>
                                  {asist.tipo_liq === 'HORA' ? `⏱️ ${asist.horas_trabajadas || 0} hs` : `📑 ${asist.sesiones || 0} ses`}
                                  {asist.tipo_liq === 'SESION' && parsed.pacsIds && parsed.pacsIds.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', justifyContent: 'center', marginTop: '4px', maxWidth: '240px' }}>
                                      {parsed.pacsIds.map(id => {
                                        const pac = mapaPacientes[id];
                                        const estAsist = asistenciasPacientesFecha[id];
                                        const esMatch = estAsist === 'Presente';
                                        return (
                                          <span
                                            key={id}
                                            title={pac ? `${pac.nombre_apellido} (DNI: ${pac.dni || 'S/D'}) - Asistencia: ${estAsist || 'Sin registro'}` : `ID: ${id}`}
                                            style={{
                                              fontSize: '10px',
                                              padding: '2px 5px',
                                              borderRadius: '4px',
                                              fontWeight: 'bold',
                                              background: esMatch ? '#dcfce7' : '#fee2e2',
                                              color: esMatch ? '#166534' : '#991b1b',
                                              border: `1px solid ${esMatch ? '#86efac' : '#fca5a5'}`,
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '3px'
                                            }}
                                          >
                                            <span>{esMatch ? '🟢' : '🔴'}</span>
                                            <span>{pac?.nombre_apellido ? pac.nombre_apellido.split(' ')[0] : `ID ${id}`}</span>
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '12px 10px', fontWeight: '600', color: '#15803d' }}>
                                  {asist.tipo_liq === 'HORA' ? `$${asist.valor_hora}/hs` : `$${asist.valor_sesion}/ses`}
                                </td>
                                <td style={{ padding: '12px 10px', color: '#64748b', fontStyle: parsed.limpiaObs ? 'normal' : 'italic' }}>
                                  {parsed.limpiaObs || '-'}
                                </td>
                              </>
                            );
                          })() : (
                            <>
                              <td colSpan="5" style={{ padding: '12px 10px', color: '#94a3b8', fontStyle: 'italic' }}>
                                Ausente / Sin Registrar
                              </td>
                            </>
                          )}

                          <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                            {asist ? (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                                <button
                                  onClick={() => abrirFormularioAsistencia(aux, asist)}
                                  style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => eliminarAsistencia(asist.id_registro)}
                                  style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                                >
                                  Quitar
                                </button>
                                {showAddButton && (
                                  <button
                                    onClick={() => abrirFormularioAsistencia(aux)}
                                    style={{ background: '#10b981', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                                    title="Registrar otro horario para este día"
                                  >
                                    ➕ Otro
                                  </button>
                                )}
                              </div>
                            ) : (
                              <button
                                onClick={() => abrirFormularioAsistencia(aux)}
                                style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                              >
                                ✍️ Presente
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
      )}

      {/* ==================== VISTA 2: GESTION DE AUXILIARES ==================== */}
      {pestañaActiva === 'auxiliares' && (
        <div>
          {cargandoAuxiliares ? (
            <p style={{ color: '#64748b' }}>Cargando auxiliares...</p>
          ) : auxiliares.length === 0 ? (
            <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
              No hay auxiliares en la planilla. Use el botón superior para agregar personal auxiliar.
            </p>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '12px 10px' }}>ID Auxiliar</th>
                    <th style={{ padding: '12px 10px' }}>Nombre Completo</th>
                    <th style={{ padding: '12px 10px' }}>Liquidación Predeterminada</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Valor Hora Predet.</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Valor Sesión Predet.</th>
                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {auxiliares.map(aux => (
                    <tr key={aux.id_auxiliar} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '12px 10px', color: '#64748b' }}>
                        #{aux.id_auxiliar}
                      </td>
                      <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#1e293b' }}>
                        {aux.nombre}
                      </td>
                      <td style={{ padding: '12px 10px' }}>
                        <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                          {aux.tipo_liq}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '600' }}>
                        {aux.valor_hora ? `$${parsearDecimal(aux.valor_hora).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '600' }}>
                        {aux.valor_sesion ? `$${parsearDecimal(aux.valor_sesion).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => abrirFormularioAuxiliar(aux)}
                            style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => eliminarAuxiliar(aux.id_auxiliar)}
                            style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== VISTA 3: HISTORIAL GENERAL ==================== */}
      {pestañaActiva === 'historial' && (
        <div>
          {cargandoHistorial ? (
            <p style={{ color: '#64748b' }}>Cargando historial...</p>
          ) : historialCompleto.length === 0 ? (
            <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
              No se registran asistencias en el historial.
            </p>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '12px 10px' }}>Fecha</th>
                    <th style={{ padding: '12px 10px' }}>Auxiliar</th>
                    <th style={{ padding: '12px 10px' }}>Tipo Liq.</th>
                    <th style={{ padding: '12px 10px' }}>Mañana</th>
                    <th style={{ padding: '12px 10px' }}>Tarde</th>
                    <th style={{ padding: '12px 10px', textAlign: 'center' }}>Horas / Sesiones</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Tarifa</th>
                    <th style={{ padding: '12px 10px', textAlign: 'right' }}>Total Devengado</th>
                    <th style={{ padding: '12px 10px' }}>Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {historialCompleto
                    .filter(reg => (reg.nombre || '').toLowerCase().includes(filtroNombre.toLowerCase()))
                    .map(reg => {
                      const tarifa = reg.tipo_liq === 'HORA' ? parsearDecimal(reg.valor_hora) || 0 : parsearDecimal(reg.valor_sesion) || 0;
                      const cantidad = reg.tipo_liq === 'HORA' ? parsearDecimal(reg.horas_trabajadas) || 0 : parsearDecimal(reg.sesiones) || 0;
                      const totalDevengado = tarifa * cantidad;

                    const parsed = parsearPrestadoresObs(reg.obs);
                    const displayM = formatearPrestadoresDisplay(parsed.prestadorM1, parsed.shareM1, parsed.prestadorM2, parsed.shareM2);
                    const displayT = formatearPrestadoresDisplay(parsed.prestadorT1, parsed.shareT1, parsed.prestadorT2, parsed.shareT2);
                    return (
                      <tr key={reg.id_registro} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <td style={{ padding: '12px 10px', whiteSpace: 'nowrap', fontWeight: '500', color: '#475569' }}>
                          📅 {new Date(reg.fecha + 'T00:00:00').toLocaleDateString('es-AR')}
                        </td>
                        <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#1e293b' }}>
                          {reg.nombre}
                        </td>
                        <td style={{ padding: '12px 10px' }}>
                          <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                            {reg.tipo_liq}
                          </span>
                        </td>
                        <td style={{ padding: '12px 10px', color: '#475569' }}>
                          {reg.hora_entrada_m ? `${reg.hora_entrada_m.substring(0, 5)} a ${reg.hora_salida_m ? reg.hora_salida_m.substring(0, 5) : '?'}` : '-'}
                          {displayM && <div style={{ fontSize: '11px', color: '#6b21a8', fontWeight: 'bold', marginTop: '2px' }}>{displayM}</div>}
                        </td>
                        <td style={{ padding: '12px 10px', color: '#475569' }}>
                          {reg.hora_entrada_t ? `${reg.hora_entrada_t.substring(0, 5)} a ${reg.hora_salida_t ? reg.hora_salida_t.substring(0, 5) : '?'}` : '-'}
                          {displayT && <div style={{ fontSize: '11px', color: '#6b21a8', fontWeight: 'bold', marginTop: '2px' }}>{displayT}</div>}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: '600' }}>
                          {reg.tipo_liq === 'HORA' ? `${reg.horas_trabajadas || 0} hs` : `${reg.sesiones || 0} ses`}
                          {reg.tipo_liq === 'SESION' && parsed.pacsIds && parsed.pacsIds.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', justifyContent: 'center', marginTop: '4px', maxWidth: '200px' }}>
                              {parsed.pacsIds.map(id => {
                                const pac = mapaPacientes[id];
                                return (
                                  <span
                                    key={id}
                                    title={pac ? `${pac.nombre_apellido} (ID ${id})` : `ID ${id}`}
                                    style={{
                                      fontSize: '10px',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      background: '#f1f5f9',
                                      color: '#334155',
                                      border: '1px solid #cbd5e1',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '2px'
                                    }}
                                  >
                                    👤 {pac?.nombre_apellido ? pac.nombre_apellido.split(' ')[0] : `ID ${id}`}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', color: '#64748b' }}>
                          ${tarifa.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 'bold', color: '#15803d' }}>
                          ${totalDevengado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '12px 10px', color: '#64748b' }}>
                          {parsed.limpiaObs || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================== MODAL 1: REGISTRAR/EDITAR ASISTENCIA ==================== */}
      {modalAsistenciaAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '550px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: 'bold' }}>
                📝 Registro de Asistencia: {auxiliarSeleccionadoAsist?.nombre}
              </h3>
              <button onClick={() => setModalAsistenciaAbierto(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Fecha Planilla</label>
                <input type="text" value={fechaTrabajo} disabled style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', background: '#f1f5f9', color: '#64748b', fontSize: '13px' }} />
              </div>
              
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Tipo de Liquidación</label>
                <select
                  value={tipoLiq}
                  onChange={(e) => {
                    const nuevoTipo = e.target.value;
                    setTipoLiq(nuevoTipo);
                    if (nuevoTipo === 'SESION') {
                      setModalSeleccionPacientesAbierto(true);
                    }
                  }}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                >
                  <option value="HORA">Por Horas Trabajadas (HORA)</option>
                  <option value="SESION">Por Sesiones Realizadas (SESION)</option>
                </select>
              </div>
            </div>

            {tipoLiq === 'HORA' ? (
              <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '15px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#1e3a8a' }}>🌅 Horarios Turno Mañana</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Entrada Mañana</label>
                    <input type="time" value={horaEntradaM} onChange={(e) => setHoraEntradaM(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Salida Mañana</label>
                    <input type="time" value={horaSalidaM} onChange={(e) => setHoraSalidaM(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  <div style={{ gridColumn: 'span 2', marginTop: '5px', display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Prestador Auxiliado 1 (Mañana)</label>
                      <select
                        value={prestadorM1}
                        onChange={(e) => setPrestadorM1(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: '#fff' }}
                      >
                        <option value="">-- Ninguno --</option>
                        {prestadores.map(p => (
                          <option key={p.id} value={p.nombre}>{p.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Prop. 1</label>
                      <input
                        type="number"
                        placeholder="1"
                        value={shareM1}
                        onChange={(e) => setShareM1(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', textAlign: 'center' }}
                      />
                    </div>
                  </div>

                  <div style={{ gridColumn: 'span 2', marginTop: '2px', display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Prestador Auxiliado 2 (Mañana - Opcional)</label>
                      <select
                        value={prestadorM2}
                        onChange={(e) => setPrestadorM2(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: '#fff' }}
                      >
                        <option value="">-- Ninguno --</option>
                        {prestadores.map(p => (
                          <option key={p.id} value={p.nombre}>{p.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Prop. 2</label>
                      <input
                        type="number"
                        placeholder="1"
                        value={shareM2}
                        disabled={!prestadorM2}
                        onChange={(e) => setShareM2(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', textAlign: 'center', background: !prestadorM2 ? '#f1f5f9' : '#fff' }}
                      />
                    </div>
                  </div>
                </div>

                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#1e3a8a' }}>🌆 Horarios Turno Tarde</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Entrada Tarde</label>
                    <input type="time" value={horaEntradaT} onChange={(e) => setHoraEntradaT(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Salida Tarde</label>
                    <input type="time" value={horaSalidaT} onChange={(e) => setHoraSalidaT(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  
                  <div style={{ gridColumn: 'span 2', marginTop: '5px', display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Prestador Auxiliado 1 (Tarde)</label>
                      <select
                        value={prestadorT1}
                        onChange={(e) => setPrestadorT1(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: '#fff' }}
                      >
                        <option value="">-- Ninguno --</option>
                        {prestadores.map(p => (
                          <option key={p.id} value={p.nombre}>{p.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Prop. 1</label>
                      <input
                        type="number"
                        placeholder="1"
                        value={shareT1}
                        onChange={(e) => setShareT1(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', textAlign: 'center' }}
                      />
                    </div>
                  </div>

                  <div style={{ gridColumn: 'span 2', marginTop: '2px', display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Prestador Auxiliado 2 (Tarde - Opcional)</label>
                      <select
                        value={prestadorT2}
                        onChange={(e) => setPrestadorT2(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: '#fff' }}
                      >
                        <option value="">-- Ninguno --</option>
                        {prestadores.map(p => (
                          <option key={p.id} value={p.nombre}>{p.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Prop. 2</label>
                      <input
                        type="number"
                        placeholder="1"
                        value={shareT2}
                        disabled={!prestadorT2}
                        onChange={(e) => setShareT2(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', textAlign: 'center', background: !prestadorT2 ? '#f1f5f9' : '#fff' }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}>Total Horas Trabajadas</label>
                    <input type="text" value={horasTrabajadas} onChange={(e) => setHorasTrabajadas(e.target.value)} placeholder="Ej: 8.5" style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 'bold', background: '#fff' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Valor Tarifa Hora ($)</label>
                    <input type="number" value={valorHora} onChange={(e) => setValorHora(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '15px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#1e3a8a' }}>📑 Carga por Sesiones</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}>Cantidad de Sesiones</label>
                    <input type="number" value={sesiones} onChange={(e) => setSesiones(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontWeight: 'bold' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Valor Tarifa Sesión ($)</label>
                    <input type="number" value={valorSesion} onChange={(e) => setValorSesion(e.target.value)} placeholder="0.00" style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                  </div>
                  
                  <div style={{ gridColumn: 'span 2', marginTop: '10px', display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Prestador Auxiliado 1</label>
                      <select
                        value={prestadorM1}
                        onChange={(e) => setPrestadorM1(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: '#fff' }}
                      >
                        <option value="">-- Ninguno --</option>
                        {prestadores.map(p => (
                          <option key={p.id} value={p.nombre}>{p.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Prop. 1</label>
                      <input
                        type="number"
                        placeholder="1"
                        value={shareM1}
                        onChange={(e) => setShareM1(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', textAlign: 'center' }}
                      />
                    </div>
                  </div>

                  <div style={{ gridColumn: 'span 2', marginTop: '5px', display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Prestador Auxiliado 2 (Opcional)</label>
                      <select
                        value={prestadorM2}
                        onChange={(e) => setPrestadorM2(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', background: '#fff' }}
                      >
                        <option value="">-- Ninguno --</option>
                        {prestadores.map(p => (
                          <option key={p.id} value={p.nombre}>{p.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', color: '#475569', marginBottom: '4px' }}>Prop. 2</label>
                      <input
                        type="number"
                        placeholder="1"
                        value={shareM2}
                        disabled={!prestadorM2}
                        onChange={(e) => setShareM2(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', textAlign: 'center', background: !prestadorM2 ? '#f1f5f9' : '#fff' }}
                      />
                    </div>
                  </div>

                  {/* Selector y Detalle de Pacientes con Cruce de Asistencia */}
                  <div style={{ gridColumn: 'span 2', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', marginTop: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                        👥 Pacientes atendidos ({pacientesSeleccionadosSesion.length}):
                      </label>
                      <button
                        type="button"
                        onClick={() => setModalSeleccionPacientesAbierto(true)}
                        style={{
                          background: '#0284c7',
                          color: '#fff',
                          border: 'none',
                          padding: '5px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        🔍 Abrir Selector de Pacientes
                      </button>
                    </div>

                    {pacientesSeleccionadosSesion.length === 0 ? (
                      <div 
                        onClick={() => setModalSeleccionPacientesAbierto(true)}
                        style={{ padding: '12px', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '6px', textAlign: 'center', cursor: 'pointer', color: '#64748b', fontSize: '12px' }}
                      >
                        👉 Haz clic para seleccionar qué pacientes atendió y cruzar con la asistencia de la fecha
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {pacientesSeleccionadosSesion.map(id => {
                          const p = mapaPacientes[id];
                          const estAsist = asistenciasPacientesFecha[id];
                          const esMatch = estAsist === 'Presente';
                          return (
                            <span
                              key={id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: '600',
                                background: esMatch ? '#dcfce7' : '#fee2e2',
                                color: esMatch ? '#166534' : '#991b1b',
                                border: `1px solid ${esMatch ? '#86efac' : '#fca5a5'}`
                              }}
                            >
                              <span>{esMatch ? '🟢' : '🔴'}</span>
                              <span>{p?.nombre_apellido || `ID: ${id}`}</span>
                              <span style={{ fontSize: '10px', opacity: 0.8 }}>({estAsist || 'Sin registro'})</span>
                              {!esMatch && (
                                <button
                                  type="button"
                                  disabled={actualizandoAsistPacId === id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    marcarPacientePresenteEnBD(p || { id_paciente: id, nombre_apellido: `ID ${id}` }, e);
                                  }}
                                  title="Corregir asistencia: Marcar como Presente en la planilla de pacientes"
                                  style={{
                                    background: '#16a34a',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '1px 6px',
                                    fontSize: '10px',
                                    fontWeight: 'bold',
                                    cursor: actualizandoAsistPacId === id ? 'wait' : 'pointer',
                                    marginLeft: '3px'
                                  }}
                                >
                                  {actualizandoAsistPacId === id ? '⏳' : '✓ Presente'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  const filtered = pacientesSeleccionadosSesion.filter(x => x !== id);
                                  setPacientesSeleccionadosSesion(filtered);
                                  setSesiones(String(filtered.length));
                                }}
                                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontWeight: 'bold', marginLeft: '3px' }}
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Observaciones del Día</label>
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Notas o aclaraciones adicionales..."
                rows="2"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setModalAsistenciaAbierto(false)}
                disabled={guardandoAsist}
                style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Cancelar
              </button>
              <button
                onClick={guardarAsistencia}
                disabled={guardandoAsist}
                style={{ padding: '8px 20px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                {guardandoAsist ? 'Guardando...' : 'Confirmar Asistencia'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL DE SELECCIÓN Y CRUCE DE PACIENTES (MODALIDAD SESIÓN) ==================== */}
      {modalSeleccionPacientesAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(2px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '780px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #cbd5e1', overflow: 'hidden' }}>
            
            {/* Cabecera Modal */}
            <div style={{ padding: '16px 22px', background: '#0f172a', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', color: '#38bdf8', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  👥 Seleccionar Pacientes Atendidos por {auxiliarSeleccionadoAsist?.nombre || 'Auxiliar'}
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  📅 Fecha Planilla: <strong>{registroEdicion?.fecha || fechaTrabajo}</strong> — Cruzando con la Asistencia de Pacientes de este día
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalSeleccionPacientesAbierto(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '22px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                &times;
              </button>
            </div>

            {/* Notificación de corrección de asistencia en vivo */}
            {notificacionModalPac && (
              <div style={{ background: '#dcfce7', color: '#166534', borderBottom: '1px solid #86efac', padding: '10px 22px', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>✓</span>
                <span>{notificacionModalPac.texto}</span>
              </div>
            )}

            {/* Panel de Estadísticas y KPIs de Match */}
            <div style={{ padding: '12px 22px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e293b' }}>
                  Seleccionados: <strong style={{ color: '#0284c7', fontSize: '15px' }}>{pacientesSeleccionadosSesion.length}</strong>
                </span>
                <span style={{ fontSize: '11px', background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '12px', fontWeight: 'bold', border: '1px solid #86efac', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  🟢 {seleccionadosMatchCount} con Match (Presente)
                </span>
                <span style={{ fontSize: '11px', background: '#fee2e2', color: '#991b1b', padding: '3px 8px', borderRadius: '12px', fontWeight: 'bold', border: '1px solid #fca5a5', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  🔴 {seleccionadosNoMatchCount} sin Match (Ausente / Sin registro)
                </span>
              </div>

              {pacientesSeleccionadosSesion.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPacientesSeleccionadosSesion([]);
                    setSesiones('0');
                  }}
                  style={{ background: '#fff', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', color: '#64748b', fontWeight: '600' }}
                >
                  Desmarcar todos
                </button>
              )}
            </div>

            {/* Buscador y Pestañas de Filtro */}
            <div style={{ padding: '12px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '10px', background: '#fff' }}>
              <input
                type="text"
                placeholder="🔍 Buscar por nombre del paciente o DNI..."
                value={busquedaPacModal}
                onChange={(e) => setBusquedaPacModal(e.target.value)}
                style={{ width: '100%', padding: '8px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' }}
              />

              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
                {[
                  { id: 'TODOS', label: `Todos (${listaPacientesMaestro.length})` },
                  { id: 'MATCH', label: `🟢 Presentes / Match (${totalMatchCount})` },
                  { id: 'NOMATCH', label: `🔴 Sin Match / Ausentes (${totalNoMatchCount})` },
                  { id: 'SELECCIONADOS', label: `✓ Seleccionados (${pacientesSeleccionadosSesion.length})` }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFiltroMatchPac(tab.id)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      border: filtroMatchPac === tab.id ? '1px solid #0284c7' : '1px solid #e2e8f0',
                      background: filtroMatchPac === tab.id ? '#e0f2fe' : '#f8fafc',
                      color: filtroMatchPac === tab.id ? '#0369a1' : '#64748b',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Listado de Pacientes */}
            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '420px', padding: '12px 22px', background: '#f8fafc' }}>
              {cargandoCrucePacientes ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                  ⏳ Consultando asistencias de pacientes para la fecha...
                </div>
              ) : listaFiltradaPacientesCruce.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  No se encontraron pacientes con los filtros seleccionados.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {listaFiltradaPacientesCruce.map(p => {
                    const isSelected = pacientesSeleccionadosSesion.includes(p.id_paciente);
                    const estadoAsist = asistenciasPacientesFecha[p.id_paciente];
                    const esMatch = estadoAsist === 'Presente';

                    return (
                      <div
                        key={p.id_paciente}
                        onClick={() => togglePacienteSeleccionado(p.id_paciente)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          border: isSelected 
                            ? (esMatch ? '2px solid #16a34a' : '2px solid #dc2626')
                            : '1px solid #e2e8f0',
                          background: isSelected 
                            ? (esMatch ? '#dcfce7' : '#fee2e2')
                            : '#ffffff',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}} // Manejado por onClick del contenedor
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                          <div>
                            <span style={{ fontWeight: isSelected ? 'bold' : '600', color: '#0f172a', fontSize: '13px' }}>
                              {p.nombre_apellido}
                            </span>
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                              DNI: {p.dni || 'S/D'} • ID: {p.id_paciente}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {esMatch ? (
                            <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '4px 10px', borderRadius: '6px', background: '#bbf7d0', color: '#166534', border: '1px solid #86efac', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              🟢 Presente (Match)
                            </span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '4px 8px', borderRadius: '6px', background: '#fecaca', color: '#991b1b', border: '1px solid #fca5a5', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                🔴 {estadoAsist || 'Sin registro'}
                              </span>
                              <button
                                type="button"
                                disabled={actualizandoAsistPacId === p.id_paciente}
                                onClick={(e) => marcarPacientePresenteEnBD(p, e)}
                                title="Corregir asistencia: Marcar como Presente en la planilla de pacientes de esta fecha"
                                style={{
                                  padding: '5px 10px',
                                  fontSize: '11px',
                                  fontWeight: 'bold',
                                  background: '#16a34a',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: actualizandoAsistPacId === p.id_paciente ? 'wait' : 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                }}
                              >
                                {actualizandoAsistPacId === p.id_paciente ? '⏳ Guardando...' : '✓ Marcar Presente 🟢'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pie de Acciones */}
            <div style={{ padding: '14px 22px', background: '#fff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '12px', color: '#475569' }}>
                Total de sesiones a liquidar: <strong style={{ color: '#0f172a', fontSize: '13px' }}>{pacientesSeleccionadosSesion.length}</strong>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalSeleccionPacientesAbierto(false)}
                  style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                >
                  Cerrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSesiones(String(pacientesSeleccionadosSesion.length));
                    setModalSeleccionPacientesAbierto(false);
                  }}
                  style={{ padding: '8px 20px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
                >
                  ✓ Confirmar Selección ({pacientesSeleccionadosSesion.length} sesiones)
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ==================== MODAL 2: ABM AUXILIAR MASTER ==================== */}
      {modalAuxiliarAbierto && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '25px', borderRadius: '12px', width: '90%', maxWidth: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: '10px', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a', fontWeight: 'bold' }}>
                👤 {auxiliarAEditar ? 'Editar Auxiliar' : 'Agregar Auxiliar Nuevo'}
              </h3>
              <button onClick={() => setModalAuxiliarAbierto(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Nombre Completo *</label>
              <input
                type="text"
                value={nombreAux}
                onChange={(e) => setNombreAux(e.target.value)}
                placeholder="Ej: LOPEZ JUAN CARLOS"
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Tipo de Liquidación Predeterminada</label>
              <select
                value={tipoLiqAux}
                onChange={(e) => setTipoLiqAux(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
              >
                <option value="HORA">Por Horas Trabajadas (HORA)</option>
                <option value="SESION">Por Sesiones Realizadas (SESION)</option>
              </select>
            </div>

            {tipoLiqAux === 'HORA' ? (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Valor Hora Predeterminado ($)</label>
                <input
                  type="number"
                  value={valorHoraAux}
                  onChange={(e) => setValorHoraAux(e.target.value)}
                  placeholder="Ej: 3200"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
            ) : (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Valor Sesión Predeterminado ($)</label>
                <input
                  type="number"
                  value={valorSesionAux}
                  onChange={(e) => setValorSesionAux(e.target.value)}
                  placeholder="Ej: 3500"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setModalAuxiliarAbierto(false)}
                disabled={guardandoAux}
                style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Cancelar
              </button>
              <button
                onClick={guardarAuxiliar}
                disabled={guardandoAux}
                style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                {guardandoAux ? 'Guardando...' : 'Guardar Auxiliar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
