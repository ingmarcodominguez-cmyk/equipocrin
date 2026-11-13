import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase.js';

export default function CargaMasivaAcuerdosOS({ onVolver, usuario, onExito }) {
  const [cargando, setCargando] = useState(true);
  const [pacientes, setPacientes] = useState([]);
  const [prestacionesOS, setPrestacionesOS] = useState([]);
  const [acuerdosExistentes, setAcuerdosExistentes] = useState([]);

  // Formulario principal
  const [prestacionId, setPrestacionId] = useState('');
  const [fechaAcuerdo, setFechaAcuerdo] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [observacionManual, setObservacionManual] = useState('');

  // Filtros de pacientes
  const [filtroObraSocial, setFiltroObraSocial] = useState('TODAS');
  const [busquedaPaciente, setBusquedaPaciente] = useState('');
  const [pacientesSeleccionados, setPacientesSeleccionados] = useState(new Set());

  // Modal para crear nueva prestación de Obra Social al vuelo
  const [modalNuevaPrestacion, setModalNuevaPrestacion] = useState(false);
  const [nuevaOSNombre, setNuevaOSNombre] = useState('');
  const [nuevaPrestacionMes, setNuevaPrestacionMes] = useState('');
  const [nuevaPrestacionAnio, setNuevaPrestacionAnio] = useState(() => new Date().getFullYear().toString());
  const [creandoPrestacion, setCreandoPrestacion] = useState(false);

  // Estados de guardado masivo
  const [guardando, setGuardando] = useState(false);
  const [progreso, setProgreso] = useState({ actual: 0, total: 0 });
  const [resultadoExito, setResultadoExito] = useState(null);
  const [mensajeError, setMensajeError] = useState('');

  // Cargar datos
  const cargarDatos = async () => {
    setCargando(true);
    setMensajeError('');
    try {
      const [pacResp, presResp, acResp] = await Promise.all([
        supabase
          .from('pacientes_motor')
          .select('id_paciente, nombre_apellido, dni, obra_social, estado')
          .order('nombre_apellido', { ascending: true }),
        supabase
          .from('prestaciones_motor')
          .select('*')
          .order('nombre_prestacion', { ascending: true }),
        supabase
          .from('acuerdos_motor')
          .select('id_acuerdo, id_paciente, id_prestacion, estado')
          .eq('estado', 'ACTIVO')
      ]);

      if (pacResp.error) throw pacResp.error;
      if (presResp.error) throw presResp.error;
      if (acResp.error) throw acResp.error;

      setPacientes(pacResp.data || []);
      setAcuerdosExistentes(acResp.data || []);

      // Filtrar prestaciones de Obra Social
      const esOS = p => {
        const nom = (p.nombre_prestacion || '').toUpperCase().trim();
        const obs = (p.observaciones || '').toUpperCase();
        return nom.startsWith('OS-') || nom.startsWith('OS ') || obs.includes('OBRA_SOCIAL') || obs.includes('OBRA SOCIAL');
      };

      const listaOS = (presResp.data || []).filter(esOS);
      setPrestacionesOS(listaOS);

      // Si hay una de "SUBSIDIO DE SALUD" reciente, preseleccionarla
      if (listaOS.length > 0 && !prestacionId) {
        const subsidioReciente = listaOS.find(p => p.nombre_prestacion.toUpperCase().includes('SUBSIDIO DE SALUD'));
        if (subsidioReciente) {
          setPrestacionId(String(subsidioReciente.id_prestacion));
        } else {
          setPrestacionId(String(listaOS[0].id_prestacion));
        }
      }
    } catch (err) {
      console.error('Error al cargar datos para carga masiva:', err);
      setMensajeError('Error al cargar datos: ' + err.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Prestación seleccionada
  const prestacionSeleccionada = useMemo(() => {
    return prestacionesOS.find(p => String(p.id_prestacion) === String(prestacionId)) || null;
  }, [prestacionesOS, prestacionId]);

  // Extraer nombre de la Obra Social de la prestación seleccionada
  const obraSocialDetectada = useMemo(() => {
    if (!prestacionSeleccionada) return '';
    const obs = prestacionSeleccionada.observaciones || '';
    if (obs.includes('OBRA_SOCIAL:')) {
      const match = obs.match(/OBRA_SOCIAL:\s*([^\s,\]]+)/i);
      if (match && match[1]) return match[1].trim().toUpperCase();
    }
    const nom = prestacionSeleccionada.nombre_prestacion || '';
    const matchOS = nom.match(/^OS[- ]\s*([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)(?=\s+(?:ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE|\d{4}|$))/i);
    if (matchOS && matchOS[1]) {
      return matchOS[1].trim().toUpperCase();
    }
    return '';
  }, [prestacionSeleccionada]);

  // Cuando cambia la prestación seleccionada, autoseleccionar el filtro de Obra Social si coincide
  useEffect(() => {
    if (obraSocialDetectada) {
      // Buscar coincidencia en la lista de Obras Sociales de pacientes
      const existe = pacientes.some(p => (p.obra_social || '').toUpperCase().includes(obraSocialDetectada));
      if (existe) {
        setFiltroObraSocial(obraSocialDetectada);
      }
    }
  }, [obraSocialDetectada, pacientes]);

  // Lista única de Obras Sociales de pacientes para el desplegable
  const listaObrasSocialesPacientes = useMemo(() => {
    const setOS = new Set();
    pacientes.forEach(p => {
      const os = (p.obra_social || '').trim().toUpperCase();
      if (os) setOS.add(os);
    });
    return Array.from(setOS).sort();
  }, [pacientes]);

  // Set de IDs de pacientes que ya tienen esta prestación activa
  const pacientesConPrestacionActiva = useMemo(() => {
    if (!prestacionSeleccionada) return new Set();
    const setIds = new Set();
    const targetPresId = prestacionSeleccionada.id_prestacion;
    acuerdosExistentes.forEach(ac => {
      if (ac.id_prestacion === targetPresId && ac.estado === 'ACTIVO') {
        setIds.add(ac.id_paciente);
      }
    });
    return setIds;
  }, [prestacionSeleccionada, acuerdosExistentes]);

  // Pacientes filtrados
  const pacientesFiltrados = useMemo(() => {
    const term = busquedaPaciente.trim().toLowerCase();
    const osFiltro = filtroObraSocial.trim().toUpperCase();

    return pacientes.filter(p => {
      // Filtro OS
      if (osFiltro !== 'TODAS') {
        const pOS = (p.obra_social || '').toUpperCase();
        if (!pOS.includes(osFiltro)) return false;
      }
      // Filtro texto
      if (term) {
        const nom = (p.nombre_apellido || '').toLowerCase();
        const dni = String(p.dni || '').toLowerCase();
        if (!nom.includes(term) && !dni.includes(term)) return false;
      }
      return true;
    });
  }, [pacientes, filtroObraSocial, busquedaPaciente]);

  // Manejadores de selección
  const togglePaciente = id => {
    setPacientesSeleccionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const seleccionarTodosVisibles = () => {
    setPacientesSeleccionados(prev => {
      const next = new Set(prev);
      pacientesFiltrados.forEach(p => {
        // No auto-seleccionar si ya tiene el acuerdo activo (a menos que el usuario lo tilde a mano)
        if (!pacientesConPrestacionActiva.has(p.id_paciente)) {
          next.add(p.id_paciente);
        }
      });
      return next;
    });
  };

  const deseleccionarTodosVisibles = () => {
    setPacientesSeleccionados(prev => {
      const next = new Set(prev);
      pacientesFiltrados.forEach(p => next.delete(p.id_paciente));
      return next;
    });
  };

  const limpiarTodaSeleccion = () => {
    setPacientesSeleccionados(new Set());
  };

  // Crear nueva prestación de Obra Social al vuelo
  const handleCrearNuevaPrestacion = async e => {
    e.preventDefault();
    const os = nuevaOSNombre.trim().toUpperCase();
    const mes = nuevaPrestacionMes.trim().toUpperCase();
    const anio = nuevaPrestacionAnio.trim();

    if (!os) {
      alert('Ingresá el nombre de la Obra Social (ej: SUBSIDIO DE SALUD).');
      return;
    }

    const nombreFinal = `OS- ${os}${mes ? ' ' + mes : ''}${anio ? ' ' + anio : ''}`;

    setCreandoPrestacion(true);
    try {
      const { data: maxRows } = await supabase
        .from('prestaciones_motor')
        .select('id_prestacion')
        .order('id_prestacion', { ascending: false })
        .limit(1);

      const nextId = (maxRows && maxRows[0]?.id_prestacion ? maxRows[0].id_prestacion : 0) + 1;

      const nuevaFila = {
        id_prestacion: nextId,
        nombre_prestacion: nombreFinal,
        tipo_prestacion: 'UNICO',
        activa: 'SI',
        flujo_obligatorio: 'DIRECTO',
        prestacion_inicial: 'NO',
        observaciones: `OBRA_SOCIAL:${os}`,
        tipo_vencimiento: '1'
      };

      const { data: insData, error: insErr } = await supabase
        .from('prestaciones_motor')
        .insert([nuevaFila])
        .select();

      if (insErr) throw insErr;

      const creada = (insData && insData[0]) || nuevaFila;
      setPrestacionesOS(prev => [creada, ...prev]);
      setPrestacionId(String(creada.id_prestacion));
      setModalNuevaPrestacion(false);
      setNuevaOSNombre('');
      setNuevaPrestacionMes('');
      alert(`✅ Prestación "${nombreFinal}" creada con éxito.`);
    } catch (err) {
      console.error('Error al crear prestación OS:', err);
      alert('Error: ' + err.message);
    } finally {
      setCreandoPrestacion(false);
    }
  };

  // Ejecutar Guardado Masivo
  const ejecutarCargaMasiva = async () => {
    if (!prestacionSeleccionada) {
      alert('Seleccioná la prestación de Obra Social.');
      return;
    }
    if (!fechaAcuerdo) {
      alert('Indicá la fecha del acuerdo.');
      return;
    }
    if (pacientesSeleccionados.size === 0) {
      alert('Seleccioná al menos un paciente para asignarle el acuerdo.');
      return;
    }

    const cantidad = pacientesSeleccionados.size;
    const nombrePres = prestacionSeleccionada.nombre_prestacion;

    const confirma = window.confirm(
      `¿Confirmás registrar el acuerdo "${nombrePres}" para los ${cantidad} paciente(s) seleccionados?\n\n` +
      `📌 FORMATO OBRA SOCIAL:\n` +
      `• Costo paciente: $0 (Sin generar deuda en su cuenta corriente)\n` +
      `• Fecha del acuerdo: ${fechaAcuerdo}\n` +
      `• Quedará listo como Acuerdo Pendiente de Facturar a la O.S.`
    );

    if (!confirma) return;

    setGuardando(true);
    setProgreso({ actual: 0, total: cantidad });
    setMensajeError('');

    try {
      const osFinal = obraSocialDetectada || 'O.S.';
      const obsTexto = observacionManual.trim()
        ? `Cobertura Obra Social: ${osFinal} - ${observacionManual.trim()}`
        : `Cobertura Obra Social: ${osFinal}`;

      const userNom = usuario?.nombre || usuario?.email || 'Admin';

      const arrayPacientesIds = Array.from(pacientesSeleccionados);
      const nuevosAcuerdos = arrayPacientesIds.map(pacId => ({
        id_paciente: Number(pacId),
        id_prestacion: Number(prestacionSeleccionada.id_prestacion),
        fecha_acuerdo: fechaAcuerdo,
        tipo_acuerdo: prestacionSeleccionada.tipo_prestacion || 'UNICO',
        monto_cuota_base: '0',
        importe_actual: '0',
        dia_vencimiento: null,
        admite_recargo: 'NO',
        estado: 'ACTIVO',
        observaciones: obsTexto,
        usuario: userNom
      }));

      // Insertar en lotes de a 50 para evitar sobrecarga
      const loteSize = 50;
      let insertadosTotal = 0;

      for (let i = 0; i < nuevosAcuerdos.length; i += loteSize) {
        const lote = nuevosAcuerdos.slice(i, i + loteSize);
        const { error: insErr } = await supabase.from('acuerdos_motor').insert(lote);
        if (insErr) throw insErr;
        insertadosTotal += lote.length;
        setProgreso({ actual: insertadosTotal, total: cantidad });
      }

      setResultadoExito({
        cantidad: insertadosTotal,
        prestacion: nombrePres,
        fecha: fechaAcuerdo
      });

      if (onExito) {
        onExito({ cantidad: insertadosTotal, prestacion: nombrePres });
      }
    } catch (err) {
      console.error('Error al guardar acuerdos masivos:', err);
      setMensajeError('Error al guardar los acuerdos: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{
      background: '#ffffff',
      padding: '24px',
      borderRadius: '16px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      color: '#1e293b',
      maxWidth: '1100px',
      margin: '0 auto'
    }}>
      {/* ENCABEZADO */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        borderBottom: '1px solid #e2e8f0',
        paddingBottom: '16px',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>⚡</span>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: '#065f46' }}>
              Carga Masiva de Acuerdos de Obra Social
            </h2>
          </div>
          <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#64748b', maxWidth: '750px' }}>
            Asigná una misma prestación de Obra Social a múltiples pacientes simultáneamente.
            <strong style={{ color: '#047857' }}> Formato O.S.: cuota $0, sin generar deuda al paciente</strong>, listo para la facturación mensual del Centro.
          </p>
        </div>

        <button
          type="button"
          onClick={onVolver}
          style={{
            padding: '9px 16px',
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            color: '#475569'
          }}
        >
          ← Volver
        </button>
      </div>

      {/* MENSAJES DE ERROR / ÉXITO */}
      {mensajeError && (
        <div style={{
          padding: '12px 16px',
          background: '#fee2e2',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          color: '#b91c1c',
          fontSize: '13.5px',
          fontWeight: '600',
          marginBottom: '16px'
        }}>
          ⚠️ {mensajeError}
        </div>
      )}

      {resultadoExito && (
        <div style={{
          padding: '18px 22px',
          background: '#ecfdf5',
          border: '1.5px solid #6ee7b7',
          borderRadius: '12px',
          color: '#065f46',
          marginBottom: '24px'
        }}>
          <h3 style={{ margin: '0 0 6px 0', fontSize: '17px', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px' }}>
            🎉 ¡Carga Masiva Exitosa!
          </h3>
          <p style={{ margin: 0, fontSize: '14px' }}>
            Se registraron con éxito <strong>{resultadoExito.cantidad} acuerdos</strong> de la prestación <strong>{resultadoExito.prestacion}</strong> con fecha <strong>{resultadoExito.fecha}</strong>.
          </p>
          <p style={{ margin: '6px 0 14px 0', fontSize: '12.5px', color: '#047857' }}>
            Ninguno generó deuda a cargo de los pacientes. Ya figuran en la lista de Acuerdos de Obra Social para facturar.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => {
                setResultadoExito(null);
                setPacientesSeleccionados(new Set());
                cargarDatos();
              }}
              style={{
                padding: '8px 14px',
                background: '#059669',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px'
              }}
            >
              ➕ Realizar otra carga masiva
            </button>
            <button
              type="button"
              onClick={onVolver}
              style={{
                padding: '8px 14px',
                background: '#fff',
                color: '#065f46',
                border: '1px solid #059669',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px'
              }}
            >
              Listo, volver
            </button>
          </div>
        </div>
      )}

      {cargando ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', color: '#64748b' }}>
          <div style={{ fontSize: '28px', marginBottom: '10px' }}>⏳</div>
          <p style={{ margin: 0, fontSize: '14px', fontWeight: '600' }}>Cargando pacientes y prestaciones de Obra Social...</p>
        </div>
      ) : (
        <div>
          {/* PASO 1 Y 2: PRESTACIÓN Y FECHA */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
            background: '#f0fdf4',
            border: '1.5px solid #a7f3d0',
            borderRadius: '12px',
            padding: '18px',
            marginBottom: '20px'
          }}>
            {/* Selector de Prestación de O.S. */}
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#065f46' }}>
                  1. Prestación de Obra Social a Asignar *
                </label>
                <button
                  type="button"
                  onClick={() => setModalNuevaPrestacion(true)}
                  style={{
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  ➕ Crear Nueva Prestación O.S.
                </button>
              </div>

              <select
                value={prestacionId}
                onChange={e => setPrestacionId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #6ee7b7',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  background: '#fff',
                  color: '#064e3b'
                }}
              >
                <option value="">-- Seleccioná la prestación de Obra Social --</option>
                {prestacionesOS.map(p => (
                  <option key={p.id_prestacion} value={p.id_prestacion}>
                    {p.nombre_prestacion}
                  </option>
                ))}
              </select>

              {prestacionSeleccionada && (
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '11.5px', background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                    🏢 O.S.: {obraSocialDetectada || 'General'}
                  </span>
                  <span style={{ fontSize: '11.5px', background: '#e0e7ff', color: '#3730a3', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                    Tipo: {prestacionSeleccionada.tipo_prestacion || 'UNICO'}
                  </span>
                  <span style={{ fontSize: '11.5px', background: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                    Costo paciente: $0 (Sin Deuda)
                  </span>
                </div>
              )}
            </div>

            {/* Fecha del Acuerdo */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#065f46', marginBottom: '6px' }}>
                2. Fecha del Acuerdo *
              </label>
              <input
                type="date"
                value={fechaAcuerdo}
                onChange={e => setFechaAcuerdo(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #6ee7b7',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                  background: '#fff'
                }}
              />
              <span style={{ fontSize: '11px', color: '#047857', display: 'block', marginTop: '4px' }}>
                Fecha en que rige el acuerdo
              </span>
            </div>

            {/* Observación Opcional */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#065f46', marginBottom: '6px' }}>
                Observación Opcional
              </label>
              <input
                type="text"
                value={observacionManual}
                onChange={e => setObservacionManual(e.target.value)}
                placeholder="Ej: Autorizado por auditoría..."
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #6ee7b7',
                  fontSize: '13.5px',
                  boxSizing: 'border-box',
                  background: '#fff'
                }}
              />
            </div>
          </div>

          {/* PASO 3: SELECCIÓN MASIVA DE PACIENTES */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '12px',
            padding: '18px',
            marginBottom: '20px'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0f172a' }}>
                  3. Seleccioná los Pacientes ({pacientesSeleccionados.size} seleccionados)
                </h3>
                <span style={{ fontSize: '12.5px', color: '#64748b' }}>
                  Filtrá por la Obra Social del paciente para tildarlos rápidamente.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={seleccionarTodosVisibles}
                  style={{
                    padding: '7px 12px',
                    background: '#ecfdf5',
                    color: '#047857',
                    border: '1px solid #6ee7b7',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  ☑️ Seleccionar Visibles ({pacientesFiltrados.length})
                </button>
                <button
                  type="button"
                  onClick={deseleccionarTodosVisibles}
                  style={{
                    padding: '7px 12px',
                    background: '#f8fafc',
                    color: '#64748b',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  ◻️ Deseleccionar Visibles
                </button>
                {pacientesSeleccionados.size > 0 && (
                  <button
                    type="button"
                    onClick={limpiarTodaSeleccion}
                    style={{
                      padding: '7px 12px',
                      background: '#fee2e2',
                      color: '#b91c1c',
                      border: '1px solid #fca5a5',
                      borderRadius: '6px',
                      fontSize: '12.5px',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    🗑️ Limpiar Selección ({pacientesSeleccionados.size})
                  </button>
                )}
              </div>
            </div>

            {/* FILTROS DE PACIENTES */}
            <div style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
              marginBottom: '14px',
              background: '#f8fafc',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ minWidth: '240px', flex: 1 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  Filtrar por Obra Social del Paciente:
                </label>
                <select
                  value={filtroObraSocial}
                  onChange={e => setFiltroObraSocial(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13.5px',
                    fontWeight: 'bold',
                    background: '#fff'
                  }}
                >
                  <option value="TODAS">-- TODAS LAS OBRAS SOCIALES --</option>
                  {listaObrasSocialesPacientes.map(os => (
                    <option key={os} value={os}>
                      {os}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ minWidth: '260px', flex: 2 }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  Buscar por Nombre o DNI:
                </label>
                <input
                  type="text"
                  value={busquedaPaciente}
                  onChange={e => setBusquedaPaciente(e.target.value)}
                  placeholder="Ej: Pérez, 45123999..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13.5px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* LISTA DE PACIENTES */}
            <div style={{
              maxHeight: '380px',
              overflowY: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: '8px'
            }}>
              {pacientesFiltrados.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13.5px' }}>
                  No se encontraron pacientes que coincidan con los filtros aplicados.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f1f5f9', zIndex: 1 }}>
                    <tr style={{ borderBottom: '1px solid #cbd5e1', color: '#475569' }}>
                      <th style={{ padding: '10px 12px', width: '40px', textAlign: 'center' }}>✓</th>
                      <th style={{ padding: '10px 12px' }}>Paciente</th>
                      <th style={{ padding: '10px 12px' }}>DNI</th>
                      <th style={{ padding: '10px 12px' }}>Obra Social en Ficha</th>
                      <th style={{ padding: '10px 12px' }}>Estado Previo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pacientesFiltrados.map(p => {
                      const yaTiene = pacientesConPrestacionActiva.has(p.id_paciente);
                      const tildado = pacientesSeleccionados.has(p.id_paciente);

                      return (
                        <tr
                          key={p.id_paciente}
                          onClick={() => togglePaciente(p.id_paciente)}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            cursor: 'pointer',
                            background: tildado
                              ? '#ecfdf5'
                              : yaTiene
                                ? '#fefce8'
                                : '#ffffff',
                            transition: 'background 0.1s'
                          }}
                        >
                          <td style={{ padding: '8px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={tildado}
                              onChange={() => togglePaciente(p.id_paciente)}
                              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '8px 12px', fontWeight: 'bold', color: '#0f172a' }}>
                            {p.nombre_apellido}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#64748b' }}>
                            {p.dni || 'S/D'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {p.obra_social ? (
                              <span style={{
                                background: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 'bold',
                                color: '#334155'
                              }}>
                                {p.obra_social}
                              </span>
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: '11px', fontStyle: 'italic' }}>Sin OS</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {yaTiene ? (
                              <span style={{
                                background: '#fef3c7',
                                color: '#92400e',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontSize: '11px',
                                fontWeight: 'bold'
                              }}>
                                ⚠️ Ya tiene este acuerdo
                              </span>
                            ) : (
                              <span style={{ color: '#10b981', fontSize: '11px', fontWeight: '600' }}>
                                Disponible
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* BOTÓN DE ACCIÓN / CONFIRMACIÓN */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '12px',
            padding: '16px 20px',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '800', color: '#0f172a' }}>
                Resumen de la Carga:
              </div>
              <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '2px' }}>
                <strong>{pacientesSeleccionados.size} paciente(s)</strong> recibirán el acuerdo <strong>{prestacionSeleccionada?.nombre_prestacion || '(Seleccioná una prestación)'}</strong>.
              </div>
            </div>

            <button
              type="button"
              disabled={guardando || pacientesSeleccionados.size === 0 || !prestacionSeleccionada}
              onClick={ejecutarCargaMasiva}
              style={{
                padding: '12px 24px',
                background: pacientesSeleccionados.size === 0 || !prestacionSeleccionada || guardando
                  ? '#94a3b8'
                  : '#059669',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '800',
                cursor: pacientesSeleccionados.size === 0 || !prestacionSeleccionada || guardando
                  ? 'not-allowed'
                  : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(5,150,105,0.25)',
                transition: 'all 0.15s ease'
              }}
            >
              {guardando ? (
                <>⏳ Guardando ({progreso.actual} / {progreso.total})...</>
              ) : (
                <>🚀 Registrar {pacientesSeleccionados.size} Acuerdos de Obra Social</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* MODAL CREAR PRESTACIÓN DE OBRA SOCIAL AL VUELO */}
      {modalNuevaPrestacion && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            padding: '24px',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '800', color: '#065f46' }}>
              ➕ Nueva Prestación de Obra Social
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: '#64748b' }}>
              Creá la prestación con formato estándar <code>OS- [OBRA SOCIAL] [MES] [AÑO]</code> (ej: <em>OS- SUBSIDIO DE SALUD SETIEMBRE 2026</em>).
            </p>

            <form onSubmit={handleCrearNuevaPrestacion}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                  Nombre de la Obra Social *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: SUBSIDIO DE SALUD, OSECAC, OSMATA..."
                  value={nuevaOSNombre}
                  onChange={e => setNuevaOSNombre(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                    Mes (opcional)
                  </label>
                  <select
                    value={nuevaPrestacionMes}
                    onChange={e => setNuevaPrestacionMes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13.5px',
                      background: '#fff'
                    }}
                  >
                    <option value="">-- Sin mes --</option>
                    {['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
                    Año
                  </label>
                  <input
                    type="number"
                    value={nuevaPrestacionAnio}
                    onChange={e => setNuevaPrestacionAnio(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 10px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13.5px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              <div style={{
                background: '#f0fdf4',
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '12px',
                color: '#166534',
                border: '1px solid #bbf7d0'
              }}>
                <strong>Vista previa:</strong> <code>OS- {nuevaOSNombre.trim().toUpperCase() || '[O.S.]'}{nuevaPrestacionMes ? ` ${nuevaPrestacionMes}` : ''}{nuevaPrestacionAnio ? ` ${nuevaPrestacionAnio}` : ''}</code>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalNuevaPrestacion(false)}
                  style={{
                    padding: '8px 14px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    color: '#475569'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creandoPrestacion}
                  style={{
                    padding: '8px 16px',
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '13px'
                  }}
                >
                  {creandoPrestacion ? 'Creando...' : 'Crear y Seleccionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
