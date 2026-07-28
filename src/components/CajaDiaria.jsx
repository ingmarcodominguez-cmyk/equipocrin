import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function CajaDiaria({ onVolver, usuario }) {
  const getLocalDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getTomorrowLocalDateString = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const year = tomorrow.getFullYear();
    const month = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const day = String(tomorrow.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroFecha, setFiltroFecha] = useState(getLocalDateString());
  const [modalAbierto, setModalAbierto] = useState(null); // 'ingreso', 'egreso', o 'cierre'
  
  // Estados para el formulario de la transacción (Ingreso/Egreso)
  const [fechaTx, setFechaTx] = useState(getLocalDateString());
  const [conceptoTx, setConceptoTx] = useState('');
  const [montoTx, setMontoTx] = useState('');
  const [observacionTx, setObservacionTx] = useState('');
  
  // Estados para el formulario de Cierre/Rendición
  const [saldoRealCierre, setSaldoRealCierre] = useState('');
  const [turnoCierre, setTurnoCierre] = useState('TARDE');
  const [entregadoPorCierre, setEntregadoPorCierre] = useState(usuario || 'Sistema');
  const [recibidoPorCierre, setRecibidoPorCierre] = useState('DIRECCIÓN');
  const [motivoDifCierre, setMotivoDifCierre] = useState('');
  const [fechaSiguienteApertura, setFechaSiguienteApertura] = useState('');

  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    cargarCaja();
  }, []);

  const cargarCaja = async () => {
    setCargando(true);
    try {
      // Obtener todos los movimientos de caja en efectivo
      const { data, error } = await supabase
        .from('caja_motor')
        .select('*')
        .eq('medio_pago', 'EFECTIVO')
        .order('fecha', { ascending: true })
        .order('id_mov', { ascending: true });

      if (error) throw error;

      // Calcular saldo acumulado secuencialmente
      let saldoAcumulado = 0;
      const movsConSaldo = (data || []).map(m => {
        const imp = parseFloat(m.importe) || 0;
        if (m.tipo === 'INGRESO' || m.tipo === 'APERTURA') {
          saldoAcumulado += imp;
        } else if (m.tipo === 'EGRESO') {
          saldoAcumulado -= imp;
        }
        return {
          ...m,
          saldoCalculado: saldoAcumulado
        };
      });

      // Guardamos la lista ordenada de más reciente a más antiguo para mostrar en la tabla
      setMovimientos(movsConSaldo.reverse());
    } catch (err) {
      console.error("Error al cargar movimientos de caja:", err);
      alert("Error al cargar la caja diaria: " + err.message);
    } finally {
      setCargando(false);
    }
  };

  // Saldo final absoluto de la caja (el saldo del último movimiento registrado)
  const saldoCajaTotal = movimientos.length > 0 ? movimientos[0].saldoCalculado : 0;

  // Obtener fecha de mañana por defecto
  const getTomorrowDate = () => {
    return getTomorrowLocalDateString();
  };

  // Abrir modal de transacción
  const abrirModal = (tipo) => {
    setModalAbierto(tipo);
    setFechaTx(getLocalDateString());
    if (tipo === 'cierre') {
      setSaldoRealCierre(saldoCajaTotal.toString());
      setTurnoCierre('TARDE');
      setEntregadoPorCierre(usuario || 'Sistema');
      setRecibidoPorCierre('DIRECCIÓN');
      setMotivoDifCierre('');
      setFechaSiguienteApertura(getTomorrowDate());
    } else {
      setConceptoTx(tipo === 'egreso' ? '' : 'Ingreso Manual de Caja');
      setMontoTx('');
      setObservacionTx('');
    }
  };

  // Confirmar y guardar la transacción en la base de datos (Ingreso/Egreso simple)
  const confirmarTransaccion = async () => {
    const importeNum = parseFloat(montoTx);
    if (isNaN(importeNum) || importeNum <= 0) {
      alert("Por favor ingrese un importe válido mayor a 0.");
      return;
    }
    if (!conceptoTx.trim()) {
      alert("Por favor ingrese un concepto.");
      return;
    }

    setGuardando(true);
    try {
      const nuevoMov = {
        fecha: fechaTx,
        usuario: usuario || 'Sistema',
        recibido_por: null,
        entregado_por: null,
        turno: null,
        id_turno: null,
        tipo: modalAbierto.toUpperCase(), // 'INGRESO' o 'EGRESO'
        concepto: conceptoTx,
        medio_pago: 'EFECTIVO',
        importe: importeNum.toString(),
        saldo: '0.00', 
        id_pago: null,
        observaciones: observacionTx || null,
        cierre_turno: false
      };

      const { error } = await supabase
        .from('caja_motor')
        .insert([nuevoMov]);

      if (error) throw error;

      alert("Transacción registrada con éxito.");
      setModalAbierto(null);
      await cargarCaja();
    } catch (err) {
      console.error("Error al guardar transacción:", err);
      alert("Error al guardar la transacción: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  // Procesar cierre de caja completo con rendición y apertura
  const confirmarCierreCaja = async () => {
    const saldoRealNum = parseFloat(saldoRealCierre);
    if (isNaN(saldoRealNum) || saldoRealNum < 0) {
      alert("Por favor ingrese un saldo real físico válido (mayor o igual a 0).");
      return;
    }
    if (!fechaSiguienteApertura) {
      alert("Por favor seleccione la fecha de apertura para el siguiente turno.");
      return;
    }

    setGuardando(true);
    try {
      const saldoTeorico = saldoCajaTotal;
      const diferencia = saldoRealNum - saldoTeorico;
      const fechaHoy = getLocalDateString();
      const hhmm = new Date().toTimeString().split(' ')[0].substring(0, 5).replace(':', '');
      const autoIdTurno = `${fechaHoy.replace(/-/g, '')}_${hhmm}_${turnoCierre}`;

      // 1. Registrar Ajuste por Diferencia (si la hay) para cuadrar saldo teórico con saldo real físico
      if (diferencia !== 0) {
        const registroAjuste = {
          fecha: fechaHoy,
          usuario: usuario || 'Sistema',
          recibido_por: null,
          entregado_por: null,
          turno: turnoCierre,
          id_turno: autoIdTurno,
          tipo: diferencia < 0 ? 'EGRESO' : 'INGRESO',
          concepto: diferencia < 0 ? 'Faltante de Caja - Ajuste por Cierre' : 'Sobrante de Caja - Ajuste por Cierre',
          medio_pago: 'EFECTIVO',
          importe: Math.abs(diferencia).toString(),
          saldo: '0.00',
          id_pago: null,
          observaciones: motivoDifCierre || (diferencia < 0 ? 'Ajuste por faltante detectado en rendición' : 'Ajuste por sobrante detectado en rendición'),
          cierre_turno: false
        };

        const { error: errAjuste } = await supabase.from('caja_motor').insert([registroAjuste]);
        if (errAjuste) throw errAjuste;
      }

      // 2. Insertar el registro contable de CIERRE
      const registroCierre = {
        fecha: fechaHoy,
        usuario: usuario || 'Sistema',
        recibido_por: recibidoPorCierre || null,
        entregado_por: entregadoPorCierre || null,
        turno: turnoCierre,
        id_turno: autoIdTurno,
        tipo: 'CIERRE',
        concepto: `CIERRE DE CAJA - TURNO ${turnoCierre}`,
        medio_pago: 'EFECTIVO',
        importe: '0',
        saldo: saldoRealNum.toString(),
        id_pago: null,
        observaciones: motivoDifCierre || null,
        cierre_turno: true,
        saldo_turno: saldoRealNum.toString(),
        diferencia: diferencia.toString(),
        motivo_dif: motivoDifCierre || null
      };

      const { error: errCierre } = await supabase.from('caja_motor').insert([registroCierre]);
      if (errCierre) throw errCierre;

      // 3. Registrar el egreso de RENDICION A DIRECCION para dejar la caja física en 0
      const registroRendicion = {
        fecha: fechaHoy,
        usuario: usuario || 'Sistema',
        recibido_por: recibidoPorCierre || null,
        entregado_por: entregadoPorCierre || null,
        turno: turnoCierre,
        id_turno: autoIdTurno,
        tipo: 'EGRESO',
        concepto: 'RENDICION A DIRECCION',
        medio_pago: 'EFECTIVO',
        importe: saldoRealNum.toString(),
        saldo: '0.00',
        id_pago: null,
        observaciones: `Rendición de caja por cierre de turno ${turnoCierre}. Caja en cero.`,
        cierre_turno: false
      };

      const { error: errRendicion } = await supabase.from('caja_motor').insert([registroRendicion]);
      if (errRendicion) throw errRendicion;

      // 4. Registrar la APERTURA de caja para el día/turno siguiente con el saldo real físico
      const registroAperturaSiguiente = {
        fecha: fechaSiguienteApertura,
        usuario: usuario || 'Sistema',
        recibido_por: null,
        entregado_por: recibidoPorCierre || null,
        turno: turnoCierre === 'MAÑANA' ? 'TARDE' : 'MAÑANA',
        id_turno: `${fechaSiguienteApertura.replace(/-/g, '')}_APERTURA_${turnoCierre === 'MAÑANA' ? 'TARDE' : 'MAÑANA'}`,
        tipo: 'APERTURA',
        concepto: 'APERTURA DE CAJA',
        medio_pago: 'EFECTIVO',
        importe: saldoRealNum.toString(), // El saldo físico arrastrado ingresa como saldo de apertura
        saldo: saldoRealNum.toString(),
        id_pago: null,
        observaciones: `Saldo de apertura inicial arrastrado del cierre anterior`,
        cierre_turno: false,
        saldo_turno: saldoRealNum.toString()
      };

      const { error: errApertura } = await supabase.from('caja_motor').insert([registroAperturaSiguiente]);
      if (errApertura) throw errApertura;

      alert("Cierre de caja y apertura de siguiente turno procesados con éxito.");
      setModalAbierto(null);
      await cargarCaja();
    } catch (err) {
      console.error("Error al procesar el cierre de caja:", err);
      alert("Error al procesar el cierre de caja: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  // Filtrar los movimientos según la fecha seleccionada
  const movimientosFiltrados = movimientos.filter(m => m.fecha === filtroFecha);

  // Totales de la fecha seleccionada
  const ingresosDelDia = movimientosFiltrados
    .filter(m => m.tipo === 'INGRESO' || m.tipo === 'APERTURA')
    .reduce((acc, m) => acc + (parseFloat(m.importe) || 0), 0);

  const egresosDelDia = movimientosFiltrados
    .filter(m => m.tipo === 'EGRESO')
    .reduce((acc, m) => acc + (parseFloat(m.importe) || 0), 0);

  // Diferencia calculada para el modal de cierre
  const diferenciaCalculada = (parseFloat(saldoRealCierre) || 0) - saldoCajaTotal;

  return (
    <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', fontFamily: 'Segoe UI, system-ui, sans-serif', color: '#1e293b' }}>
      
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '18px', marginBottom: '25px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            💵 Caja Diaria en Efectivo
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
            Visualización, control, egresos y cierres de la caja diaria.
          </p>
        </div>
        <button 
          onClick={onVolver}
          style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', transition: 'all 0.2s' }}
        >
          ← Volver al Menú
        </button>
      </div>

      {/* Tarjetas de Información Financiera */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '25px' }}>
        
        {/* Saldo de Caja Total */}
        <div style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', padding: '20px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Saldo Físico en Caja
          </span>
          <h3 style={{ margin: '8px 0 2px 0', fontSize: '26px', fontWeight: '800', color: '#1e3a8a' }}>
            ${saldoCajaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
          <span style={{ fontSize: '11px', color: '#3b82f6' }}>Saldo total acumulado actual</span>
        </div>

        {/* Ingresos de la Fecha */}
        <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', padding: '20px', borderRadius: '12px', border: '1px solid #bbf7d0' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#166534', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Ingresos del Día
          </span>
          <h3 style={{ margin: '8px 0 2px 0', fontSize: '26px', fontWeight: '800', color: '#14532d' }}>
            +${ingresosDelDia.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
          <span style={{ fontSize: '11px', color: '#22c55e' }}>Entradas de efectivo registradas hoy</span>
        </div>

        {/* Egresos de la Fecha */}
        <div style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', padding: '20px', borderRadius: '12px', border: '1px solid #fecaca' }}>
          <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Egresos del Día
          </span>
          <h3 style={{ margin: '8px 0 2px 0', fontSize: '26px', fontWeight: '800', color: '#7f1d1d' }}>
            -${egresosDelDia.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </h3>
          <span style={{ fontSize: '11px', color: '#ef4444' }}>Salidas de efectivo registradas hoy</span>
        </div>

      </div>

      {/* Panel de Filtros y Acciones */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '15px 20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '25px' }}>
        
        {/* Selector de Fecha */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', color: '#475569' }}>Filtrar por Fecha:</label>
          <input 
            type="date"
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', outline: 'none', background: '#ffffff', color: '#0f172a' }}
          />
        </div>

        {/* Botones de Operación */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => abrirModal('ingreso')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#10b981', color: '#ffffff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.1)' }}
          >
            ➕ Ingreso Manual
          </button>
          <button
            onClick={() => abrirModal('egreso')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ef4444', color: '#ffffff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.1)' }}
          >
            ➖ Registrar Egreso
          </button>
          <button
            onClick={() => abrirModal('cierre')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#4f46e5', color: '#ffffff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(79, 70, 229, 0.1)' }}
          >
            🔒 Cerrar Caja / Rendir
          </button>
        </div>

      </div>

      {/* Modal de Transacción (Ingreso/Egreso) */}
      {modalAbierto && modalAbierto !== 'cierre' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', padding: '25px', borderRadius: '16px', width: '100%', maxWidth: '450px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', fontWeight: 'bold', color: '#0f172a' }}>
              {modalAbierto === 'egreso' ? '➖ Registrar Egreso de Caja' : '➕ Registrar Ingreso Manual'}
            </h3>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Fecha *</label>
              <input 
                type="date"
                value={fechaTx}
                onChange={(e) => setFechaTx(e.target.value)}
                style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Concepto / Motivo *</label>
              <input 
                type="text"
                value={conceptoTx}
                onChange={(e) => setConceptoTx(e.target.value)}
                placeholder={modalAbierto === 'egreso' ? "Ej: Artículos de limpieza, Pago remis, etc." : "Ej: Carga inicial de caja"}
                style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Importe ($) *</label>
              <input 
                type="number"
                value={montoTx}
                onChange={(e) => setMontoTx(e.target.value)}
                placeholder="Ej: 1500"
                style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Observaciones adicionales</label>
              <textarea 
                value={observacionTx}
                onChange={(e) => setObservacionTx(e.target.value)}
                placeholder="Opcional..."
                style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px', height: '60px', resize: 'none' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => setModalAbierto(null)}
                disabled={guardando}
                style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Cancelar
              </button>
              <button 
                onClick={confirmarTransaccion}
                disabled={guardando}
                style={{ padding: '8px 20px', background: modalAbierto === 'egreso' ? '#ef4444' : '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                {guardando ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Modal de Cierre de Caja / Rendición */}
      {modalAbierto === 'cierre' && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#ffffff', padding: '25px', borderRadius: '16px', width: '100%', maxWidth: '480px', border: '1px solid #e2e8f0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', fontWeight: 'bold', color: '#1e3a8a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🔒 Cierre y Rendición de Caja
            </h3>

            {/* Cuadro de Saldos */}
            <div style={{ background: '#f8fafc', padding: '12px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '15px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#475569' }}>Saldo Teórico del Sistema:</span>
                <span style={{ fontWeight: 'bold', color: '#0f172a' }}>${saldoCajaTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ color: '#475569' }}>Saldo Real Físico ingresado:</span>
                <span style={{ fontWeight: 'bold', color: '#0f172a' }}>${(parseFloat(saldoRealCierre) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #cbd5e1', paddingTop: '4px', marginTop: '4px' }}>
                <span style={{ color: '#475569', fontWeight: '600' }}>Diferencia (Sobrante/Faltante):</span>
                <span style={{ 
                  fontWeight: 'bold', 
                  color: diferenciaCalculada === 0 ? '#166534' : diferenciaCalculada > 0 ? '#b45309' : '#b91c1c' 
                }}>
                  {diferenciaCalculada === 0 ? '$0,00 (Cuadrada)' : diferenciaCalculada > 0 ? `+$${diferenciaCalculada.toLocaleString('es-AR', { minimumFractionDigits: 2 })} (Sobrante)` : `-$${Math.abs(diferenciaCalculada).toLocaleString('es-AR', { minimumFractionDigits: 2 })} (Faltante)`}
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Saldo Real Físico (Contado) *</label>
                <input 
                  type="number"
                  value={saldoRealCierre}
                  onChange={(e) => setSaldoRealCierre(e.target.value)}
                  placeholder="Ej: 87200"
                  style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Turno que Cierra *</label>
                <select 
                  value={turnoCierre}
                  onChange={(e) => setTurnoCierre(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                >
                  <option value="MAÑANA">MAÑANA</option>
                  <option value="TARDE">TARDE</option>
                  <option value="NOCHE">NOCHE</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Entregado Por *</label>
                <input 
                  type="text"
                  value={entregadoPorCierre}
                  onChange={(e) => setEntregadoPorCierre(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Recibido Por (Rendición) *</label>
                <input 
                  type="text"
                  value={recibidoPorCierre}
                  onChange={(e) => setRecibidoPorCierre(e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Fecha de Apertura Siguiente Turno *</label>
              <input 
                type="date"
                value={fechaSiguienteApertura}
                onChange={(e) => setFechaSiguienteApertura(e.target.value)}
                style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }}
              />
            </div>

            {diferenciaCalculada !== 0 && (
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', color: '#991b1b', marginBottom: '4px' }}>Explicación/Motivo de la Diferencia *</label>
                <textarea 
                  value={motivoDifCierre}
                  onChange={(e) => setMotivoDifCierre(e.target.value)}
                  placeholder="Ej: Error en vuelto de $100 al paciente X..."
                  style={{ width: '100%', padding: '8px', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '13px', height: '50px', resize: 'none', background: '#fff5f5' }}
                />
              </div>
            )}

            <div style={{ background: '#f0fdf4', padding: '10px 12px', borderRadius: '6px', border: '1px solid #bbf7d0', fontSize: '11px', color: '#166534', marginBottom: '20px' }}>
              ℹ️ Al confirmar: se registrará el Cierre y el ajuste correspondiente; se rendirá el efectivo a Dirección dejando la caja en cero; y se abrirá el siguiente turno con un saldo inicial igual a <strong>${(parseFloat(saldoRealCierre) || 0).toLocaleString('es-AR')}</strong>.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => setModalAbierto(null)}
                disabled={guardando}
                style={{ padding: '8px 16px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                Cancelar
              </button>
              <button 
                onClick={confirmarCierreCaja}
                disabled={guardando || (diferenciaCalculada !== 0 && !motivoDifCierre.trim())}
                style={{ padding: '8px 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600' }}
              >
                {guardando ? 'Guardando...' : 'Confirmar Cierre y Apertura'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Tabla de Movimientos del Día */}
      <div>
        <h3 style={{ fontSize: '15px', color: '#0f172a', fontWeight: 'bold', margin: '0 0 15px 0' }}>
          📋 Movimientos de la Fecha ({filtroFecha ? new Date(filtroFecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/F'})
        </h3>
        {cargando ? (
          <p style={{ fontSize: '14px', color: '#64748b' }}>Cargando caja...</p>
        ) : movimientosFiltrados.length === 0 ? (
          <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '30px', borderRadius: '12px', textAlign: 'center', border: '1px dashed #cbd5e1' }}>
            No se registran movimientos de caja en esta fecha.
          </p>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '12px 10px' }}>ID</th>
                  <th style={{ padding: '12px 10px' }}>Tipo</th>
                  <th style={{ padding: '12px 10px' }}>Concepto</th>
                  <th style={{ padding: '12px 10px' }}>Usuario</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right' }}>Importe</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right' }}>Saldo Acum.</th>
                  <th style={{ padding: '12px 10px' }}>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {movimientosFiltrados.map((m, idx) => {
                  const imp = parseFloat(m.importe) || 0;
                  return (
                    <tr key={m.id_mov || idx} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background 0.15s' }}>
                      <td style={{ padding: '10px', color: '#64748b', fontWeight: '500' }}>
                        #{m.id_mov || '-'}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ 
                          fontSize: '11px', 
                          fontWeight: 'bold', 
                          padding: '3px 8px', 
                          borderRadius: '12px',
                          background: m.tipo === 'INGRESO' ? '#dcfce7' : m.tipo === 'EGRESO' ? '#fecaca' : m.tipo === 'APERTURA' ? '#eff6ff' : m.tipo === 'CIERRE' ? '#f1f5f9' : '#f1f5f9',
                          color: m.tipo === 'INGRESO' ? '#14532d' : m.tipo === 'EGRESO' ? '#7f1d1d' : m.tipo === 'APERTURA' ? '#1e40af' : m.tipo === 'CIERRE' ? '#475569' : '#475569'
                        }}>
                          {m.tipo}
                        </span>
                      </td>
                      <td style={{ padding: '10px', color: '#0f172a', fontWeight: '600' }}>
                        {m.concepto || 'S/D'}
                      </td>
                      <td style={{ padding: '10px', color: '#475569' }}>
                        👤 {m.usuario || 'Sistema'}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', color: (m.tipo === 'INGRESO' || m.tipo === 'APERTURA') ? '#166534' : m.tipo === 'EGRESO' ? '#b91c1c' : '#475569', fontWeight: 'bold' }}>
                        {(m.tipo === 'INGRESO' || m.tipo === 'APERTURA') ? '+' : m.tipo === 'EGRESO' ? '-' : ''}${imp.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', color: '#0f172a', fontWeight: 'bold' }}>
                        ${m.saldoCalculado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px', color: '#64748b', fontStyle: m.observaciones ? 'normal' : 'italic' }}>
                        {m.observaciones || m.motivo_dif || '-'}
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
  );
}
