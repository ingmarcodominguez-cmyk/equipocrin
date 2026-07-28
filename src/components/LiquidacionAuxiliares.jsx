import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function LiquidacionAuxiliares({ onVolver, usuario }) {
  const [auxiliares, setAuxiliares] = useState([]);
  const [auxiliarSeleccionado, setAuxiliarSeleccionado] = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [cargandoAuxiliares, setCargandoAuxiliares] = useState(false);
  const [cargandoMovimientos, setCargandoMovimientos] = useState(false);

  // Estados para formularios
  const [modalAbierto, setModalAbierto] = useState(null); // 'pago', 'ajuste', 'liquidar'
  const [fechaTx, setFechaTx] = useState('');
  const [montoTx, setMontoTx] = useState('');
  const [conceptoTx, setConceptoTx] = useState('');
  const [periodoTx, setPeriodoTx] = useState(''); // ej: '07/2026'
  const [tipoAjuste, setTipoAjuste] = useState('credito'); // 'credito' (debe) o 'debito' (haber)
  const [procesandoTx, setProcesandoTx] = useState(false);

  // Lógica de Pre-liquidación automática basada en Asistencias
  const [periodoLiquidar, setPeriodoLiquidar] = useState(''); // 'YYYY-MM'
  const [cargandoPreliq, setCargandoPreliq] = useState(false);
  const [asistenciasPreliq, setAsistenciasPreliq] = useState([]);
  const [preliqTotal, setPreliqTotal] = useState(0);

  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  useEffect(() => {
    cargarAuxiliares();
  }, []);

  useEffect(() => {
    if (auxiliarSeleccionado) {
      cargarMovimientos(auxiliarSeleccionado.id_auxiliar);
    }
  }, [auxiliarSeleccionado]);

  // Buscar auxiliares y saldos consolidados
  const cargarAuxiliares = async () => {
    setCargandoAuxiliares(true);
    try {
      const { data: listaAux, error: errA } = await supabase
        .from('auxiliares_motor')
        .select('*')
        .order('nombre', { ascending: true });

      if (errA) throw errA;

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
        const debeVal = parseFloat(m.debe) || 0;
        const haberVal = parseFloat(m.haber) || 0;
        if (!saldosMapa[id]) {
          saldosMapa[id] = 0;
        }
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

  // Cargar extracto de movimientos
  const cargarMovimientos = async (idAuxiliar) => {
    setCargandoMovimientos(true);
    try {
      const { data, error } = await supabase
        .from('movauxiliares_motor')
        .select('*')
        .eq('id_auxiliar', idAuxiliar)
        .order('fecha', { ascending: true });

      if (error) throw error;

      let saldoAcumulado = 0;
      const conSaldo = (data || []).map(m => {
        const debe = parseFloat(m.debe) || 0;
        const haber = parseFloat(m.haber) || 0;
        saldoAcumulado += (debe - haber);
        return {
          ...m,
          saldoAcumulado: saldoAcumulado
        };
      });

      setMovimientos(conSaldo.reverse());
    } catch (error) {
      console.error("Error al cargar extracto:", error);
      mostrarAlerta("Error al cargar extracto de cuenta corriente.", "error");
    } finally {
      setCargandoMovimientos(false);
    }
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
    setPeriodoTx('');
    
    if (tipo === 'pago') {
      setConceptoTx('PAGO');
    } else if (tipo === 'ajuste') {
      setConceptoTx('AJUSTE');
      setTipoAjuste('credito');
    } else if (tipo === 'liquidar') {
      const hoy = new Date();
      const mes = String(hoy.getMonth() + 1).padStart(2, '0');
      const anio = hoy.getFullYear();
      setPeriodoLiquidar(`${anio}-${mes}`);
      setAsistenciasPreliq([]);
      setPreliqTotal(0);
    }
  };

  // Calcular pre-liquidación automática del período
  const calcularPreliquidacion = async () => {
    if (!periodoLiquidar) {
      alert("Por favor seleccione un período.");
      return;
    }
    setCargandoPreliq(true);
    try {
      const [anio, mes] = periodoLiquidar.split('-');
      const primerDia = `${anio}-${mes}-01`;
      const ultimoDia = `${anio}-${mes}-31`; // Supabase resolverá correctamente las fechas intermedias

      const { data, error } = await supabase
        .from('asistencia_auxiliares_motor')
        .select('*')
        .eq('id_auxiliar', auxiliarSeleccionado.id_auxiliar)
        .gte('fecha', primerDia)
        .lte('fecha', ultimoDia);

      if (error) throw error;

      let acumuladorTotal = 0;
      const enriquecidas = (data || []).map(asist => {
        const tarifa = asist.tipo_liq === 'HORA' ? parseFloat(asist.valor_hora) || 0 : parseFloat(asist.valor_sesion) || 0;
        const cantidad = asist.tipo_liq === 'HORA' ? parseFloat(asist.horas_trabajadas) || 0 : parseFloat(asist.sesiones) || 0;
        const totalFila = tarifa * cantidad;
        acumuladorTotal += totalFila;

        return {
          ...asist,
          tarifa,
          cantidad,
          totalFila
        };
      });

      setAsistenciasPreliq(enriquecidas);
      setPreliqTotal(acumuladorTotal);
    } catch (error) {
      console.error("Error al calcular pre-liquidación:", error);
      alert("Error al cargar asistencias del período.");
    } finally {
      setCargandoPreliq(false);
    }
  };

  // Confirmar y guardar la transacción en movauxiliares_motor
  const confirmarTransaccion = async () => {
    let montoNum = parseFloat(montoTx);
    
    if (modalAbierto === 'liquidar') {
      montoNum = preliqTotal;
    }

    if (isNaN(montoNum) || montoNum <= 0) {
      alert("Por favor ingrese un importe válido mayor a 0.");
      return;
    }

    setProcesandoTx(true);
    try {
      let debeInsert = 0;
      let haberInsert = 0;
      let conceptoFinal = conceptoTx.toUpperCase();
      let periodoFinal = periodoTx || null;

      if (modalAbierto === 'pago') {
        haberInsert = montoNum;
        conceptoFinal = 'PAGO';
      } else if (modalAbierto === 'liquidar') {
        debeInsert = montoNum;
        conceptoFinal = 'LIQUIDACION';
        const [anio, mes] = periodoLiquidar.split('-');
        periodoFinal = `${mes}/${anio}`;
      } else if (modalAbierto === 'ajuste') {
        if (tipoAjuste === 'credito') {
          debeInsert = montoNum; // Crédito a favor -> Debe
          conceptoFinal = `AJUSTE CREDITO: ${conceptoTx}`;
        } else {
          haberInsert = montoNum; // Débito en contra -> Haber
          conceptoFinal = `AJUSTE DEBITO: ${conceptoTx}`;
        }
      }

      // Obtener el próximo id_movimiento consultando movauxiliares_motor
      const { data: maxMovData, error: errMaxMov } = await supabase
        .from('movauxiliares_motor')
        .select('id_mov')
        .order('id_mov', { ascending: false })
        .limit(1);

      if (errMaxMov) throw errMaxMov;
      const nextIdMov = (maxMovData && maxMovData[0]?.id_mov ? maxMovData[0].id_mov : 0) + 1;

      const nuevoMov = {
        id_mov: nextIdMov,
        id_auxiliar: auxiliarSeleccionado.id_auxiliar,
        fecha: fechaTx,
        concepto: conceptoFinal,
        periodo: periodoFinal,
        debe: debeInsert,
        haber: haberInsert,
        saldo: 0, // Campo requerido por base de datos, lo enviamos en 0
        fecha_registro: new Date().toISOString()
      };

      const { error } = await supabase
        .from('movauxiliares_motor')
        .insert([nuevoMov]);

      if (error) throw error;

      mostrarAlerta("Transacción contable registrada con éxito.", "exito");
      setModalAbierto(null);
      await cargarAuxiliares();
      await cargarMovimientos(auxiliarSeleccionado.id_auxiliar);
    } catch (error) {
      console.error("Error al registrar movimiento contable:", error);
      alert("Error al registrar movimiento: " + error.message);
    } finally {
      setProcesandoTx(false);
    }
  };

  // Calcular totales
  const totalDebe = movimientos.reduce((acc, m) => acc + (parseFloat(m.debe) || 0), 0);
  const totalHaber = movimientos.reduce((acc, m) => acc + (parseFloat(m.haber) || 0), 0);
  const saldoFinal = totalDebe - totalHaber;

  return (
    <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', fontFamily: 'Segoe UI, system-ui, sans-serif', color: '#1e293b' }}>
      
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '18px', marginBottom: '25px' }}>
        <div>
          <h2 style={{ color: '#0f172a', margin: 0, fontSize: '22px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            💰 Planilla de Liquidación de Auxiliares
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>Consultá saldos, liquidá asistencias mensuales y cargá pagos o ajustes contables.</p>
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

      {/* Selector de Auxiliar */}
      <div style={{ marginBottom: '25px', background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#475569', marginBottom: '8px' }}>
          Seleccione un Auxiliar para ver su Cuenta Corriente:
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
          {/* Tarjetas de Balance */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '25px' }}>
            
            <div style={{ padding: '20px', borderRadius: '12px', background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', border: '1px solid #bfdbfe', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Saldo Final a Pagar
              </span>
              <span style={{ fontSize: '24px', fontWeight: '800', color: saldoFinal >= 0 ? '#15803d' : '#b91c1c', marginTop: '6px' }}>
                ${saldoFinal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: '11px', color: '#60a5fa', marginTop: '4px' }}>
                Devengado (Debe) - Pagado (Haber)
              </span>
            </div>

            <div style={{ padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
                Total Devengado (Debe)
              </span>
              <span style={{ display: 'block', fontSize: '20px', fontWeight: 'bold', color: '#0f172a', marginTop: '6px' }}>
                ${totalDebe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '4px' }}>
                Liquidaciones mensuales + Créditos extras
              </span>
            </div>

            <div style={{ padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
                Total Pagado (Haber)
              </span>
              <span style={{ display: 'block', fontSize: '20px', fontWeight: 'bold', color: '#0f172a', marginTop: '6px' }}>
                ${totalHaber.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '4px' }}>
                Pagos acreditados + Débitos extras
              </span>
            </div>
          </div>

          {/* Panel de Botones de Transacción */}
          <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', background: '#f8fafc', padding: '15px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <button
              onClick={() => abrirFormulario('liquidar')}
              style={{ flex: 1, padding: '12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.background = '#2563eb'}
              onMouseOut={(e) => e.target.style.background = '#3b82f6'}
            >
              📅 Liquidar Período desde Asistencia
            </button>

            <button
              onClick={() => abrirFormulario('pago')}
              style={{ flex: 1, padding: '12px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.background = '#059669'}
              onMouseOut={(e) => e.target.style.background = '#10b981'}
            >
              💵 Registrar Pago (al Haber)
            </button>

            <button
              onClick={() => abrirFormulario('ajuste')}
              style={{ flex: 1, padding: '12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'background 0.2s' }}
              onMouseOver={(e) => e.target.style.background = '#d97706'}
              onMouseOut={(e) => e.target.style.background = '#f59e0b'}
            >
              ⚙️ Registrar Ajuste Contable
            </button>
          </div>

          {/* Formulario de Transacción Inline / Modal */}
          {modalAbierto && (
            <div style={{ background: '#f8fafc', padding: '25px', borderRadius: '12px', border: '1px solid #cbd5e1', marginBottom: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #cbd5e1', paddingBottom: '10px', marginBottom: '15px' }}>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>
                  {modalAbierto === 'pago' && '💵 Registrar Pago a Auxiliar'}
                  {modalAbierto === 'ajuste' && '⚙️ Registrar Ajuste Manual (Crédito/Débito)'}
                  {modalAbierto === 'liquidar' && '📅 Liquidar Asistencias del Mes'}
                </h4>
                <button onClick={() => setModalAbierto(null)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8' }}>&times;</button>
              </div>

              {/* FLUJO A: LIQUIDACIÓN DESDE ASISTENCIAS */}
              {modalAbierto === 'liquidar' && (
                <div>
                  <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', marginBottom: '20px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Seleccione Período (Año y Mes) *</label>
                      <input
                        type="month"
                        value={periodoLiquidar}
                        onChange={(e) => setPeriodoLiquidar(e.target.value)}
                        style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                      />
                    </div>
                    <button
                      onClick={calcularPreliquidacion}
                      disabled={cargandoPreliq}
                      style={{ padding: '11px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                    >
                      {cargandoPreliq ? 'Calculando...' : '🔍 Calcular Total'}
                    </button>
                  </div>

                  {asistenciasPreliq.length > 0 && (
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                      <h5 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#1e3a8a', fontWeight: 'bold' }}>
                        📋 Resumen de Asistencias del Período
                      </h5>
                      <div style={{ maxHeight: '150px', overflowY: 'auto', marginBottom: '15px', border: '1px solid #edf2f7', borderRadius: '6px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: '#f7fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '6px 8px' }}>Fecha</th>
                              <th style={{ padding: '6px 8px' }}>Tipo</th>
                              <th style={{ padding: '6px 8px', textAlign: 'center' }}>Cantidad</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Tarifa</th>
                              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Subtotal</th>
                            </tr>
                          </thead>
                          <tbody>
                            {asistenciasPreliq.map((asist, idx) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 8px' }}>{new Date(asist.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</td>
                                <td style={{ padding: '6px 8px' }}>{asist.tipo_liq}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{asist.cantidad} {asist.tipo_liq === 'HORA' ? 'hs' : 'ses'}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right' }}>${asist.tarifa}</td>
                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold' }}>${asist.totalFila.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', padding: '12px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#1e40af' }}>MONTO TOTAL A LIQUIDAR (Devengado):</span>
                        <span style={{ fontSize: '18px', fontWeight: '800', color: '#1e3a8a' }}>${preliqTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )}

                  {asistenciasPreliq.length === 0 && !cargandoPreliq && (
                    <p style={{ color: '#64748b', fontSize: '13px', fontStyle: 'italic', textAlign: 'center', margin: '20px 0' }}>
                      No se encontraron registros de asistencias para este período.
                    </p>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      onClick={() => setModalAbierto(null)}
                      style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                    >
                      Cancelar
                    </button>
                    {asistenciasPreliq.length > 0 && (
                      <button
                        onClick={confirmarTransaccion}
                        disabled={procesandoTx}
                        style={{ padding: '8px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
                      >
                        {procesandoTx ? 'Procesando...' : 'Confirmar y Guardar Liquidación'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* FLUJO B: PAGOS Y AJUSTES MANUALES */}
              {modalAbierto !== 'liquidar' && (
                <div>
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
                        <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px' }}>Período Asociado (Opcional)</label>
                        <input
                          type="text"
                          value={periodoTx}
                          onChange={(e) => setPeriodoTx(e.target.value)}
                          placeholder="Ej: 07/2026"
                          style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                        />
                      </div>
                    </div>
                  )}

                  {modalAbierto === 'pago' && (
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', fontSize: '12px', color: '#475569', marginBottom: '6px' }}>Período Imputado (Opcional)</label>
                      <input
                        type="text"
                        value={periodoTx}
                        onChange={(e) => setPeriodoTx(e.target.value)}
                        placeholder="Ej: 07/2026"
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
                      placeholder="Ej: Pago quincenal de haberes, Descuento materiales, etc."
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
                        background: modalAbierto === 'pago' ? '#10b981' : '#f59e0b',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '600'
                      }}
                    >
                      {procesandoTx ? 'Procesando...' : 'Confirmar Registro'}
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* Tabla de extracto contable */}
          <div>
            <h3 style={{ fontSize: '16px', color: '#0f172a', fontWeight: 'bold', margin: '0 0 15px 0' }}>
              📋 Historial de Cuenta Corriente (Extracto)
            </h3>
            {cargandoMovimientos ? (
              <p style={{ fontSize: '14px', color: '#64748b' }}>Cargando extracto contable...</p>
            ) : movimientos.length === 0 ? (
              <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
                Este auxiliar no registra movimientos en su cuenta corriente.
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
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m, idx) => {
                      const valDebe = parseFloat(m.debe) || 0;
                      const valHaber = parseFloat(m.haber) || 0;
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
                          <td style={{ padding: '10px', textAlign: 'right', color: m.saldoAcumulado >= 0 ? '#15803d' : '#b91c1c', fontWeight: 'bold' }}>
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

    </div>
  );
}
