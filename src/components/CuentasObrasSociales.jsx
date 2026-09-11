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
    fecha: new Date().toISOString().split('T')[0],
    observaciones: ''
  });
  const [guardandoCobro, setGuardandoCobro] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  const cargarDatos = async () => {
    try {
      setCargando(true);

      // 1. Cargar lista de Obras Sociales registradas en pacientes_motor
      const { data: pacsData } = await supabase
        .from('pacientes_motor')
        .select('obra_social');

      const osPacientes = (pacsData || [])
        .map(p => (p.obra_social || '').trim().toUpperCase())
        .filter(Boolean);

      // 2. Cargar movimientos de obras sociales (id_paciente = 0)
      const { data: movsData, error: errMovs } = await supabase
        .from('movimientoscuenta_motor')
        .select('*')
        .eq('id_paciente', 0)
        .order('fecha_movimiento', { ascending: false });

      if (errMovs) throw errMovs;

      const movs = movsData || [];
      setMovimientos(movs);

      // Extraer todas las obras sociales que aparecen en los movimientos
      const osMovimientos = movs.map(m => (m.subtipo || '').trim().toUpperCase()).filter(Boolean);

      const todasOS = Array.from(new Set([...osPacientes, ...osMovimientos, 'SANCOR SALUD', 'SUBSIDIO DE SALUD'])).sort();
      setObrasSocialesLista(todasOS);

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
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const limpio = String(val).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
    const num = parseFloat(limpio);
    return isNaN(num) ? 0 : num;
  };

  // Filtrado de movimientos
  const movimientosFiltrados = useMemo(() => {
    return movimientos.filter(m => {
      const osMov = (m.subtipo || '').trim().toUpperCase();
      const coincideOS = obraSocialSeleccionada === 'TODAS' || osMov === obraSocialSeleccionada;
      
      const coincideTipo = filtroTipo === 'TODOS' || 
        (filtroTipo === 'FACTURAS' && (m.tipo_movimiento === 'FACTURA_OS' || parsearMoneda(m.debe) > 0)) ||
        (filtroTipo === 'COBROS' && (m.tipo_movimiento === 'PAGO_OS' || parsearMoneda(m.haber) > 0));

      const q = busqueda.toLowerCase().trim();
      const coincideTexto = !q ||
        (m.concepto && m.concepto.toLowerCase().includes(q)) ||
        (m.subtipo && m.subtipo.toLowerCase().includes(q)) ||
        (m.usuario && m.usuario.toLowerCase().includes(q));

      return coincideOS && coincideTipo && coincideTexto;
    });
  }, [movimientos, obraSocialSeleccionada, filtroTipo, busqueda]);

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

  // Facturas pendientes de cobro y cálculo de saldos
  const facturasPendientes = useMemo(() => {
    const facturas = movimientos.filter(m => m.tipo_movimiento === 'FACTURA_OS' || parsearMoneda(m.debe) > 0);
    const cobros = movimientos.filter(m => m.tipo_movimiento === 'PAGO_OS' || parsearMoneda(m.haber) > 0);

    return facturas.map(f => {
      const montoFactura = parsearMoneda(f.debe);
      // Buscar cobros asociados por id_origen o por id_acuerdo
      const cobrosAsociados = cobros.filter(c => 
        (c.id_origen && String(c.id_origen) === String(f.id_movimiento)) ||
        (f.id_acuerdo && c.id_acuerdo && String(c.id_acuerdo) === String(f.id_acuerdo))
      );
      const totalCobrado = cobrosAsociados.reduce((sum, c) => sum + parsearMoneda(c.haber), 0);
      const saldoPendiente = Math.max(0, montoFactura - totalCobrado);

      return {
        ...f,
        montoFactura,
        totalCobrado,
        saldoPendiente,
        estaSaldada: saldoPendiente <= 0.01
      };
    }).filter(f => !f.estaSaldada);
  }, [movimientos]);

  // Facturas pendientes filtradas según la obra social activa en el modal
  const facturasPendientesModal = useMemo(() => {
    const osActual = (formCobro.obraSocial || '').trim().toUpperCase();
    if (!osActual) return facturasPendientes;
    return facturasPendientes.filter(f => (f.subtipo || '').trim().toUpperCase() === osActual);
  }, [facturasPendientes, formCobro.obraSocial]);

  const abrirModalCobro = (factura = null) => {
    if (factura) {
      setFacturaSeleccionada(factura);
      const nroFac = factura.concepto?.split(' - ')[0] || ('Factura #' + factura.id_movimiento);
      const saldo = factura.saldoPendiente !== undefined ? factura.saldoPendiente : parsearMoneda(factura.debe);
      setFormCobro({
        obraSocial: factura.subtipo || '',
        monto: String(saldo || ''),
        nroComprobante: '',
        formaPago: 'TRANSFERENCIA BANCARIA',
        fecha: new Date().toISOString().split('T')[0],
        observaciones: `Cancelación ${nroFac}`
      });
    } else {
      setFacturaSeleccionada(null);
      const osDefault = obraSocialSeleccionada !== 'TODAS' ? obraSocialSeleccionada : '';
      setFormCobro({
        obraSocial: osDefault,
        monto: '',
        nroComprobante: '',
        formaPago: 'TRANSFERENCIA BANCARIA',
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
    } else {
      setFacturaSeleccionada(fac);
      const nroFac = fac.concepto?.split(' - ')[0] || ('Factura #' + fac.id_movimiento);
      setFormCobro(prev => ({
        ...prev,
        obraSocial: fac.subtipo || prev.obraSocial,
        monto: String(fac.saldoPendiente || fac.montoFactura || ''),
        observaciones: `Cancelación ${nroFac}`
      }));
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

    try {
      setGuardandoCobro(true);

      const { data: ultMov, error: errUlt } = await supabase
        .from('movimientoscuenta_motor')
        .select('id_movimiento')
        .order('id_movimiento', { ascending: false })
        .limit(1);

      if (errUlt) throw errUlt;
      const nextId = (ultMov && ultMov[0]?.id_movimiento ? ultMov[0].id_movimiento : 0) + 1;

      const refFactura = facturaSeleccionada 
        ? ` (Cancela ${facturaSeleccionada.concepto?.split(' - ')[0] || ('Factura #' + facturaSeleccionada.id_movimiento)})` 
        : '';

      const conceptoCobro = 'Cobro / Liquidación O.S. ' + osNombre + refFactura + ' - Comp: #' + (formCobro.nroComprobante || 'S/N') + ' (' + formCobro.formaPago + ')' + (formCobro.observaciones ? ' - ' + formCobro.observaciones : '');

      const nuevoMov = {
        id_movimiento: nextId,
        id_paciente: 0,
        id_acuerdo: facturaSeleccionada?.id_acuerdo || null,
        id_origen: facturaSeleccionada?.id_movimiento || null,
        tipo_movimiento: 'PAGO_OS',
        subtipo: osNombre,
        concepto: conceptoCobro,
        debe: 0,
        haber: montoNum,
        saldo: 0,
        fecha_movimiento: formCobro.fecha || new Date().toISOString().split('T')[0],
        fecha_registro: new Date().toISOString(),
        usuario: usuario || 'Admin'
      };

      const { error: errInsert } = await supabase
        .from('movimientoscuenta_motor')
        .insert([nuevoMov]);

      if (errInsert) throw errInsert;

      setModalCobroAbierto(false);
      setFacturaSeleccionada(null);
      setFormCobro({
        obraSocial: '',
        monto: '',
        nroComprobante: '',
        formaPago: 'TRANSFERENCIA BANCARIA',
        fecha: new Date().toISOString().split('T')[0],
        observaciones: ''
      });

      setMensaje({
        texto: '✅ Cobro de $' + montoNum.toLocaleString('es-AR') + ' registrado exitosamente en la cuenta de ' + osNombre + '.',
        tipo: 'exito'
      });
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);

      await cargarDatos();

    } catch (err) {
      console.error('Error al guardar cobro de O.S.:', err);
      alert('Error al guardar cobro: ' + err.message);
    } finally {
      setGuardandoCobro(false);
    }
  };

  // Handler para anular movimiento de obra social
  const anularMovimientoOS = async (mov) => {
    const confirmar = window.confirm(
      '¿Está seguro de que desea eliminar este registro de la cuenta corriente de ' + mov.subtipo + '?' +
      '\n\n• Concepto: ' + mov.concepto +
      '\n• Importe: $' + (parsearMoneda(mov.debe) || parsearMoneda(mov.haber)).toLocaleString('es-AR') +
      '\n\nEsta acción modificará el saldo consolidado de la Obra Social.'
    );

    if (!confirmar) return;

    try {
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
          background: mensaje.tipo === 'error' ? '#fee2e2' : '#dcfce7',
          color: mensaje.tipo === 'error' ? '#991b1b' : '#166534',
          border: '1px solid ' + (mensaje.tipo === 'error' ? '#fca5a5' : '#86efac')
        }}>
          {mensaje.texto}
        </div>
      )}

      {/* TARJETAS KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px', marginBottom: '20px' }}>
        
        <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
            💼 Total Facturado a O.S. (Debe)
          </span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#2563eb', marginTop: '6px' }}>
            {'$' + totales.totalDebe.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Facturas emitidas a cobrar</span>
        </div>

        <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
            💵 Total Cobrado / Liquidado (Haber)
          </span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#16a34a', marginTop: '6px' }}>
            {'$' + totales.totalHaber.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Cobranzas y transferencias ingresadas</span>
        </div>

        <div style={{ 
          background: totales.saldoPendiente > 0 ? '#fffbeb' : '#f0fdf4', 
          padding: '18px', 
          borderRadius: '10px', 
          border: '1px solid ' + (totales.saldoPendiente > 0 ? '#fde047' : '#bbf7d0'), 
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)' 
        }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: totales.saldoPendiente > 0 ? '#854d0e' : '#166534', textTransform: 'uppercase' }}>
            ⏳ Saldo a Cobrar de O.S.
          </span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: totales.saldoPendiente > 0 ? '#d97706' : '#15803d', marginTop: '6px' }}>
            {'$' + totales.saldoPendiente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '11px', color: totales.saldoPendiente > 0 ? '#b45309' : '#166534' }}>
            {totales.saldoPendiente > 0 ? 'Monto neto adeudado por Obras Sociales' : 'Cuentas al día'}
          </span>
        </div>

        <div style={{ background: '#fff', padding: '18px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>
            📋 Registros Listados
          </span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#475569', marginTop: '6px' }}>
            {movimientosFiltrados.length}
          </div>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>Filtrados según selección</span>
        </div>

      </div>

      {/* BARRA DE FILTROS */}
      <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #e2e8f0', display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
        
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

        <div style={{ minWidth: '180px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>
            Tipo de Movimiento:
          </label>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff' }}
          >
            <option value="TODOS">Todos los tipos</option>
            <option value="FACTURAS">Solo Facturas Emitidas (Debe)</option>
            <option value="COBROS">Solo Cobros Recibidos (Haber)</option>
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

      {/* TABLA DE MOVIMIENTOS */}
      <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ margin: 0, color: '#1e293b', fontSize: '15px' }}>
            Libro de Movimientos de Cuenta Corriente ({obraSocialSeleccionada})
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
                  <th style={{ padding: '12px 14px' }}>Tipo</th>
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

                  return (
                    <tr key={m.id_movimiento} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap', fontWeight: '500', color: '#334155' }}>
                        {m.fecha_movimiento || (m.fecha_registro ? m.fecha_registro.split('T')[0] : 'S/D')}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#0f172a' }}>
                        {m.subtipo || 'OBRA SOCIAL'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          background: esFactura ? '#dbeafe' : '#dcfce7',
                          color: esFactura ? '#1e40af' : '#15803d'
                        }}>
                          {esFactura ? '📄 FACTURA' : '💵 COBRO'}
                        </span>
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
                          <button
                            type="button"
                            onClick={() => {
                              const facPend = facturasPendientes.find(f => f.id_movimiento === m.id_movimiento) || {
                                ...m,
                                montoFactura: parsearMoneda(m.debe),
                                saldoPendiente: parsearMoneda(m.debe)
                              };
                              abrirModalCobro(facPend);
                            }}
                            title="Registrar cobro para esta factura"
                            style={{
                              background: '#ecfdf5',
                              color: '#059669',
                              border: '1px solid #a7f3d0',
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              marginRight: '6px',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseOver={(e) => { e.currentTarget.style.background = '#059669'; e.currentTarget.style.color = '#fff'; }}
                            onMouseOut={(e) => { e.currentTarget.style.background = '#ecfdf5'; e.currentTarget.style.color = '#059669'; }}
                          >
                            💵 Cobrar
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
            maxWidth: '620px',
            width: '100%',
            padding: '24px',
            maxHeight: '90vh',
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
                onClick={() => { setModalCobroAbierto(false); setFacturaSeleccionada(null); }}
                style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={guardarCobroOS}>
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

              {/* LISTADO DE FACTURAS PENDIENTES DE COBRO */}
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
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
                  onClick={() => setModalCobroAbierto(false)}
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
                    background: '#059669',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {guardandoCobro ? 'Guardando...' : 'Registrar Cobro en O.S.'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
