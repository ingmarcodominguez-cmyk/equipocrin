import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

export default function FichaPaciente({ onVolver }) {
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
    const limpio = String(val).replace(/\./g, '').replace(',', '.');
    const num = Number(limpio);
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

      // Guardar todos los movimientos detallados y enriquecerlos con la prestación correspondiente
      const movimientosEnriquecidos = (movimientosData || []).map(mov => {
        const acuerdoAsociado = acuerdosConPrestacion.find(ac => String(ac.id_acuerdo) === String(mov.id_acuerdo));
        return {
          ...mov,
          nombre_prestacion: acuerdoAsociado ? acuerdoAsociado.nombre_prestacion : (mov.id_acuerdo ? `Acuerdo ID: ${mov.id_acuerdo}` : 'Sin Acuerdo')
        };
      });
      setMovimientosDetallados(movimientosEnriquecidos);

      // AGRUPACIÓN POR id_deuda (para la vista de deudas pendientes sin ceros)
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

      // FILTRAR: Ocultar los id_deuda cuyo saldo real sea 0
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

  const obtenerColorEstado = (estado) => {
    const est = (estado || '').toLowerCase();
    if (est.includes('activo')) return { bg: '#dcfce7', color: '#166534' };
    if (est.includes('finalizado')) return { bg: '#e2e8f0', color: '#334155' };
    if (est.includes('rescindido')) return { bg: '#fee2e2', color: '#991b1b' };
    return { bg: '#fef9c3', color: '#854d0e' };
  };

  const sumaTotalDeuda = deudasAgrupadas.reduce((acc, curr) => acc + curr.saldoReal, 0);

  // Totales para el resumen detallado
  const totalDebeGeneral = movimientosDetallados.reduce((acc, m) => acc + parsearMoneda(m.debe), 0);
  const totalHaberGeneral = movimientosDetallados.reduce((acc, m) => acc + parsearMoneda(m.haber), 0);
  const saldoFinalGeneral = totalDebeGeneral - totalHaberGeneral;

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
                <button
                  onClick={() => setVistaActiva('menu')}
                  style={{ background: '#e2e8f0', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#334155' }}
                >
                  ← Volver al Menú de la Ficha
                </button>
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
                        </tr>
                      </thead>
                      <tbody>
                        {movimientosDetallados.map((mov, index) => {
                          const valDebe = parsearMoneda(mov.debe);
                          const valHaber = parsearMoneda(mov.haber);
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
                            </tr>
                          );
                        })}
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
                        </tr>
                        <tr style={{ background: '#f1f5f9' }}>
                          <td colSpan="4" style={{ padding: '10px', fontWeight: 'bold', color: '#0f172a', textAlign: 'right', fontSize: '14px' }}>
                            Saldo Neto (Debe - Haber):
                          </td>
                          <td colSpan="2" style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold', color: saldoFinalGeneral > 0 ? '#dc2626' : '#16a34a', fontSize: '15px' }}>
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

        </div>
      )}

    </div>
  );
}