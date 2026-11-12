import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  FECHA_INICIO_FACTURACION_PRESTADORES,
  ACUERDO_FACTURA_RECIBIDA,
  parsearDecimalSeguro,
  esPrestadorExcluidoFacturacion,
  fetchMapaPagosPorIds,
  calcularMontoFacturarMovimiento
} from '../lib/facturacionPrestadores';

export default function CuentaFacturasPrestadores({
  prestadores = [],
  prestadorInicial = null,
  usuario,
  esCelular = false,
  onVolverExtracto
}) {
  const [cargando, setCargando] = useState(true);
  const [movsDesdeNov, setMovsDesdeNov] = useState([]);
  const [pagosMap, setPagosMap] = useState({});
  const [prestadorFocusId, setPrestadorFocusId] = useState(
    prestadorInicial && !esPrestadorExcluidoFacturacion(prestadorInicial.nombre_prestador)
      ? String(prestadorInicial.id_prestador)
      : ''
  );
  const [busqueda, setBusqueda] = useState('');
  const [soloPendientes, setSoloPendientes] = useState(false);
  const [filtroDetalle, setFiltroDetalle] = useState('TODOS'); // 'TODOS' | 'DEBE_FACTURAR' | 'FACTURAS'
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });

  // Modal / Formulario Cargar Factura Recibida
  const [formFacturaAbierto, setFormFacturaAbierto] = useState(false);
  const [fechaFactura, setFechaFactura] = useState(
    () => localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0]
  );
  const [nroFactura, setNroFactura] = useState('');
  const [montoFactura, setMontoFactura] = useState('');
  const [obsFactura, setObsFactura] = useState('');
  const [guardandoFactura, setGuardandoFactura] = useState(false);

  const prestadoresObligados = useMemo(
    () => (prestadores || []).filter(p => !esPrestadorExcluidoFacturacion(p.nombre_prestador)),
    [prestadores]
  );

  const cargarDatosFacturacion = async () => {
    setCargando(true);
    try {
      let allRows = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const { data, error } = await supabase
          .from('movprestadores_motor')
          .select('*')
          .or(`fecha.gte.${FECHA_INICIO_FACTURACION_PRESTADORES},acuerdo.eq.${ACUERDO_FACTURA_RECIBIDA}`)
          .order('fecha', { ascending: true })
          .order('id_mov', { ascending: true })
          .range(from, from + pageSize - 1);

        if (error) throw error;
        allRows = allRows.concat(data || []);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }

      // Excluir movimientos de pagos revertidos
      const revertedPagoIds = new Set();
      allRows.forEach(m => {
        if ((m.concepto || '').toUpperCase().startsWith('REVERSO') && m.id_pago) {
          revertedPagoIds.add(String(m.id_pago));
        }
      });

      const limpios = allRows.filter(m => !m.id_pago || !revertedPagoIds.has(String(m.id_pago)));
      const idPagos = limpios
        .filter(m => parsearDecimalSeguro(m.haber) > 0 && m.id_pago)
        .map(m => m.id_pago);

      const mapaPagos = await fetchMapaPagosPorIds(idPagos);
      setPagosMap(mapaPagos);
      setMovsDesdeNov(limpios);
    } catch (err) {
      console.error('Error cargando cuenta de facturas:', err);
      setMensaje({ texto: 'Error al cargar datos de facturación: ' + err.message, tipo: 'error' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatosFacturacion();
  }, []);

  const resumenPorPrestador = useMemo(() => {
    const mapa = {};
    prestadoresObligados.forEach(p => {
      mapa[String(p.id_prestador)] = {
        prestador: p,
        totalHonorariosNov: 0,
        totalDebeFacturar: 0,
        totalFacturado: 0,
        pendienteFacturar: 0,
        cantFacturas: 0,
        movimientosCuenta: []
      };
    });

    movsDesdeNov.forEach(m => {
      const pid = String(m.id_prestador);
      const entry = mapa[pid];
      if (!entry) return;

      if (m.acuerdo === ACUERDO_FACTURA_RECIBIDA) {
        const montoRec = parsearDecimalSeguro(m.saldo) || parsearDecimalSeguro(m.debe) || parsearDecimalSeguro(m.haber);
        if (montoRec > 0) {
          entry.totalFacturado = Math.round((entry.totalFacturado + montoRec) * 100) / 100;
          entry.cantFacturas += 1;
          entry.movimientosCuenta.push({
            ...m,
            tipoFila: 'FACTURA_RECIBIDA',
            debeFacturar: 0,
            facturaRecibida: montoRec
          });
        }
        return;
      }

      const haber = parsearDecimalSeguro(m.haber);
      if (haber > 0 && String(m.fecha || '').slice(0, 10) >= FECHA_INICIO_FACTURACION_PRESTADORES) {
        entry.totalHonorariosNov = Math.round((entry.totalHonorariosNov + haber) * 100) / 100;
        const aFacturar = calcularMontoFacturarMovimiento(m, pagosMap, entry.prestador.nombre_prestador);
        if (aFacturar > 0) {
          entry.totalDebeFacturar = Math.round((entry.totalDebeFacturar + aFacturar) * 100) / 100;
          entry.movimientosCuenta.push({
            ...m,
            tipoFila: 'DEBE_FACTURAR',
            debeFacturar: aFacturar,
            facturaRecibida: 0
          });
        }
      }
    });

    return Object.values(mapa)
      .map(item => {
        const pendiente = Math.round((item.totalDebeFacturar - item.totalFacturado) * 100) / 100;
        let saldoAcum = 0;
        const movsConSaldo = item.movimientosCuenta.map(mov => {
          saldoAcum = Math.round((saldoAcum + mov.debeFacturar - mov.facturaRecibida) * 100) / 100;
          return { ...mov, saldoFacturacion: saldoAcum };
        });
        return {
          ...item,
          pendienteFacturar: pendiente,
          movimientosCuenta: movsConSaldo.reverse()
        };
      })
      .sort((a, b) => b.pendienteFacturar - a.pendienteFacturar || a.prestador.nombre_prestador.localeCompare(b.prestador.nombre_prestador));
  }, [prestadoresObligados, movsDesdeNov, pagosMap]);

  const resumenFiltrado = useMemo(() => {
    return resumenPorPrestador.filter(item => {
      if (soloPendientes && item.pendienteFacturar <= 0.01) return false;
      const q = busqueda.trim().toLowerCase();
      if (!q) return true;
      return (item.prestador.nombre_prestador || '').toLowerCase().includes(q) ||
        (item.prestador.especialidad || '').toLowerCase().includes(q);
    });
  }, [resumenPorPrestador, soloPendientes, busqueda]);

  const kpisGlobales = useMemo(() => {
    return resumenPorPrestador.reduce(
      (acc, r) => ({
        debeFacturar: Math.round((acc.debeFacturar + r.totalDebeFacturar) * 100) / 100,
        facturado: Math.round((acc.facturado + r.totalFacturado) * 100) / 100,
        pendiente: Math.round((acc.pendiente + r.pendienteFacturar) * 100) / 100
      }),
      { debeFacturar: 0, facturado: 0, pendiente: 0 }
    );
  }, [resumenPorPrestador]);

  const cuentaFocus = useMemo(() => {
    if (!prestadorFocusId) return null;
    return resumenPorPrestador.find(r => String(r.prestador.id_prestador) === String(prestadorFocusId)) || null;
  }, [prestadorFocusId, resumenPorPrestador]);

  const movimientosDetalleFiltrados = useMemo(() => {
    if (!cuentaFocus) return [];
    return cuentaFocus.movimientosCuenta.filter(m => {
      if (filtroDetalle === 'DEBE_FACTURAR') return m.tipoFila === 'DEBE_FACTURAR';
      if (filtroDetalle === 'FACTURAS') return m.tipoFila === 'FACTURA_RECIBIDA';
      return true;
    });
  }, [cuentaFocus, filtroDetalle]);

  const mostrarAlerta = (texto, tipo) => {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4500);
  };

  const abrirModalCargarFactura = (item = cuentaFocus) => {
    if (item) {
      setPrestadorFocusId(String(item.prestador.id_prestador));
    }
    setFechaFactura(localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0]);
    setNroFactura('');
    setMontoFactura(item && item.pendienteFacturar > 0 ? String(item.pendienteFacturar) : '');
    setObsFactura('');
    setFormFacturaAbierto(true);
  };

  const guardarFacturaRecibida = async (e) => {
    e.preventDefault();
    if (!cuentaFocus) return;
    const montoNum = parsearDecimalSeguro(montoFactura);
    if (!montoNum || montoNum <= 0) {
      alert('Ingresá un importe válido mayor a 0.');
      return;
    }
    if (!nroFactura.trim()) {
      alert('Ingresá el número o referencia de factura.');
      return;
    }

    setGuardandoFactura(true);
    try {
      const registro = {
        id_prestador: cuentaFocus.prestador.id_prestador,
        fecha: fechaFactura || new Date().toISOString().split('T')[0],
        concepto: `Factura Recibida #${nroFactura.trim()}${obsFactura.trim() ? ` (${obsFactura.trim()})` : ''}`,
        debe: '0',
        haber: '0',
        saldo: montoNum.toFixed(2),
        usuario: usuario || 'Sistema',
        acuerdo: ACUERDO_FACTURA_RECIBIDA
      };

      const { error } = await supabase.from('movprestadores_motor').insert([registro]);
      if (error) throw error;

      setFormFacturaAbierto(false);
      mostrarAlerta(`Factura #${nroFactura.trim()} ($${montoNum.toLocaleString('es-AR', { minimumFractionDigits: 2 })}) registrada en la cuenta de ${cuentaFocus.prestador.nombre_prestador}.`, 'exito');
      await cargarDatosFacturacion();
    } catch (err) {
      console.error('Error al cargar factura:', err);
      alert('Error al guardar factura: ' + err.message);
    } finally {
      setGuardandoFactura(false);
    }
  };

  const eliminarFacturaRecibida = async (mov) => {
    const monto = parsearDecimalSeguro(mov.saldo);
    if (!window.confirm(`¿Eliminar esta factura registrada?\n\n• ${mov.concepto}\n• Importe: $${monto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`)) {
      return;
    }
    try {
      const { error } = await supabase.from('movprestadores_motor').delete().eq('id_mov', mov.id_mov);
      if (error) throw error;
      mostrarAlerta('Factura eliminada de la cuenta.', 'exito');
      await cargarDatosFacturacion();
    } catch (err) {
      alert('Error al eliminar factura: ' + err.message);
    }
  };

  const copiarReclamoWhatsApp = (item) => {
    const msg = `Hola ${item.prestador.nombre_prestador}, te paso el detalle de facturación al Centro CRIN (desde 01/11/2026 por transferencias y QR Mercado Pago):\n• Total a facturar: $${item.totalDebeFacturar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}\n• Facturas presentadas: $${item.totalFacturado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}\n• Pendiente de facturar: $${item.pendienteFacturar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}\n¡Gracias!`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(msg);
      mostrarAlerta('Resumen copiado para enviar por WhatsApp.', 'exito');
    } else {
      alert(msg);
    }
  };

  const descargarExcelCuenta = (item) => {
    const BOM = '\uFEFF';
    let csv = 'sep=;\n';
    csv += `Cuenta Corriente de Facturacion - ${item.prestador.nombre_prestador}\n`;
    csv += `Desde ${FECHA_INICIO_FACTURACION_PRESTADORES} (Transferencias y QR)\n\n`;
    csv += 'Fecha;Tipo;Concepto / Nro Factura;Debe Facturar ($);Factura Recibida ($);Saldo Pendiente ($)\r\n';
    item.movimientosCuenta.forEach(m => {
      const fecha = m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/F';
      const tipo = m.tipoFila === 'FACTURA_RECIBIDA' ? 'FACTURA RECIBIDA' : 'A FACTURAR';
      const conc = (m.concepto || '').replace(/;/g, ',');
      const df = m.debeFacturar > 0 ? m.debeFacturar.toFixed(2).replace('.', ',') : '';
      const fr = m.facturaRecibida > 0 ? m.facturaRecibida.toFixed(2).replace('.', ',') : '';
      const sal = m.saldoFacturacion.toFixed(2).replace('.', ',');
      csv += `${fecha};${tipo};${conc};${df};${fr};${sal}\r\n`;
    });
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Cuenta_Facturas_${item.prestador.nombre_prestador.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      {mensaje.texto && (
        <div style={{
          padding: '12px 18px',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13.5px',
          fontWeight: '600',
          background: mensaje.tipo === 'exito' ? '#dcfce7' : '#fee2e2',
          color: mensaje.tipo === 'exito' ? '#15803d' : '#b91c1c',
          border: `1px solid ${mensaje.tipo === 'exito' ? '#bbf7d0' : '#fecaca'}`
        }}>
          {mensaje.texto}
        </div>
      )}

      {/* Barra superior del apartado */}
      <div style={{
        background: '#faf5ff',
        border: '1px solid #d8b4fe',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h3 style={{ margin: 0, color: '#581c87', fontSize: '17px', fontWeight: '800' }}>
            🧾 Cuenta Corriente de Facturación de Prestadores
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#6b21a8' }}>
            Control de lo que cada profesional debe facturar al Centro CRIN (Transferencias + QR Mercado Pago desde <strong>01/11/2026</strong>) vs. facturas recibidas. Excluye a Viviana Jiménez y Dra. Valeria Medina.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {prestadorFocusId && (
            <button
              type="button"
              onClick={() => { setPrestadorFocusId(''); setFormFacturaAbierto(false); }}
              style={{ padding: '8px 14px', background: '#fff', border: '1px solid #c084fc', color: '#6b21a8', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12.5px' }}
            >
              👥 Ver Todos los Prestadores
            </button>
          )}
          <button
            type="button"
            onClick={onVolverExtracto}
            style={{ padding: '8px 14px', background: '#e2e8f0', border: 'none', color: '#334155', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12.5px' }}
          >
            ← Volver a Ficha de Honorarios
          </button>
        </div>
      </div>

      {cargando ? (
        <p style={{ color: '#64748b', fontSize: '14px', padding: '20px', textAlign: 'center' }}>
          Calculando movimientos desde Noviembre 2026...
        </p>
      ) : !cuentaFocus ? (
        /* VISTA GENERAL DE TODOS LOS PRESTADORES */
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: esCelular ? '1fr' : '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            <div style={{ padding: '18px', borderRadius: '12px', background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#6d28d9', textTransform: 'uppercase' }}>Total a Facturar (Nov+)</span>
              <div style={{ fontSize: '23px', fontWeight: '800', color: '#5b21b6', marginTop: '4px' }}>
                ${kpisGlobales.debeFacturar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '11px', color: '#7c3aed' }}>Proporción Transferencias + QR</span>
            </div>

            <div style={{ padding: '18px', borderRadius: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#15803d', textTransform: 'uppercase' }}>Total Facturas Recibidas</span>
              <div style={{ fontSize: '23px', fontWeight: '800', color: '#166534', marginTop: '4px' }}>
                ${kpisGlobales.facturado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '11px', color: '#16a34a' }}>Comprobantes ya cargados</span>
            </div>

            <div style={{ padding: '18px', borderRadius: '12px', background: kpisGlobales.pendiente > 0 ? '#fffbeb' : '#f0fdf4', border: `1px solid ${kpisGlobales.pendiente > 0 ? '#fde68a' : '#bbf7d0'}` }}>
              <span style={{ fontSize: '11.5px', fontWeight: 'bold', color: kpisGlobales.pendiente > 0 ? '#b45309' : '#15803d', textTransform: 'uppercase' }}>Pendiente de Reclamar</span>
              <div style={{ fontSize: '23px', fontWeight: '800', color: kpisGlobales.pendiente > 0 ? '#d97706' : '#15803d', marginTop: '4px' }}>
                ${kpisGlobales.pendiente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '11px', color: kpisGlobales.pendiente > 0 ? '#92400e' : '#16a34a' }}>Diferencia a exigir en facturas</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px', alignItems: 'center' }}>
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="🔍 Buscar profesional..."
              style={{ flex: 1, minWidth: '220px', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13.5px' }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569', background: '#f8fafc', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <input
                type="checkbox"
                checked={soloPendientes}
                onChange={(e) => setSoloPendientes(e.target.checked)}
              />
              Solo con facturas pendientes
            </label>
          </div>

          <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '12px 12px' }}>Prestador</th>
                  <th style={{ padding: '12px 12px', textAlign: 'right' }}>Honorarios Nov+</th>
                  <th style={{ padding: '12px 12px', textAlign: 'right' }}>Debe Facturar</th>
                  <th style={{ padding: '12px 12px', textAlign: 'right' }}>Facturas Recibidas</th>
                  <th style={{ padding: '12px 12px', textAlign: 'right' }}>Pendiente a Reclamar</th>
                  <th style={{ padding: '12px 12px', textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {resumenFiltrado.map(item => {
                  const debeMas = item.pendienteFacturar > 0.01;
                  return (
                    <tr key={item.prestador.id_prestador} style={{ borderBottom: '1px solid #e2e8f0', background: debeMas ? '#fffdf7' : '#fff' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 'bold', color: '#0f172a' }}>
                        {item.prestador.nombre_prestador}
                        {item.prestador.especialidad && (
                          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal' }}>{item.prestador.especialidad}</div>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: '#475569' }}>
                        ${item.totalHonorariosNov.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#6d28d9' }}>
                        ${item.totalDebeFacturar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '700', color: '#15803d' }}>
                        ${item.totalFacturado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        {item.cantFacturas > 0 && (
                          <span style={{ fontSize: '10.5px', color: '#64748b', marginLeft: '4px' }}>({item.cantFacturas})</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '800', color: debeMas ? '#d97706' : '#15803d' }}>
                        ${item.pendienteFacturar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          onClick={() => setPrestadorFocusId(String(item.prestador.id_prestador))}
                          style={{ padding: '5px 10px', background: '#ede9fe', color: '#5b21b6', border: '1px solid #c4b5fd', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', marginRight: '6px' }}
                        >
                          📋 Ver Cuenta
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirModalCargarFactura(item)}
                          style={{ padding: '5px 10px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                        >
                          + Factura
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* VISTA INDIVIDUAL DE CUENTA DE FACTURACIÓN DEL PRESTADOR */
        <div>
          <div style={{ marginBottom: '15px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={prestadorFocusId}
              onChange={(e) => { setPrestadorFocusId(e.target.value); setFormFacturaAbierto(false); }}
              style={{ flex: 1, minWidth: '240px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', fontWeight: 'bold', background: '#fff' }}
            >
              {resumenPorPrestador.map(r => (
                <option key={r.prestador.id_prestador} value={r.prestador.id_prestador}>
                  {r.prestador.nombre_prestador} — Pendiente de facturar: ${r.pendienteFacturar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => abrirModalCargarFactura(cuentaFocus)}
              style={{ padding: '10px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
            >
              ➕ Cargar Factura Recibida
            </button>

            <button
              type="button"
              onClick={() => copiarReclamoWhatsApp(cuentaFocus)}
              style={{ padding: '10px 14px', background: '#25D366', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
            >
              💬 Copiar Reclamo
            </button>

            <button
              type="button"
              onClick={() => descargarExcelCuenta(cuentaFocus)}
              style={{ padding: '10px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
            >
              📥 Excel
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: esCelular ? '1fr' : '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' }}>
            <div style={{ padding: '16px', borderRadius: '10px', background: '#f5f3ff', border: '1px solid #ddd6fe' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#6d28d9', textTransform: 'uppercase' }}>Debe Facturar (Transf. + QR)</span>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#5b21b6', marginTop: '4px' }}>
                ${cuentaFocus.totalDebeFacturar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '11px', color: '#7c3aed' }}>Desde 01/11/2026</span>
            </div>

            <div style={{ padding: '16px', borderRadius: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <span style={{ fontSize: '11.5px', fontWeight: 'bold', color: '#15803d', textTransform: 'uppercase' }}>Facturas Recibidas ({cuentaFocus.cantFacturas})</span>
              <div style={{ fontSize: '22px', fontWeight: '800', color: '#166534', marginTop: '4px' }}>
                ${cuentaFocus.totalFacturado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '11px', color: '#16a34a' }}>Cargadas en esta cuenta</span>
            </div>

            <div style={{ padding: '16px', borderRadius: '10px', background: cuentaFocus.pendienteFacturar > 0.01 ? '#fffbeb' : '#f0fdf4', border: `1px solid ${cuentaFocus.pendienteFacturar > 0.01 ? '#fde68a' : '#bbf7d0'}` }}>
              <span style={{ fontSize: '11.5px', fontWeight: 'bold', color: cuentaFocus.pendienteFacturar > 0.01 ? '#b45309' : '#15803d', textTransform: 'uppercase' }}>Pendiente de Facturar</span>
              <div style={{ fontSize: '22px', fontWeight: '800', color: cuentaFocus.pendienteFacturar > 0.01 ? '#d97706' : '#15803d', marginTop: '4px' }}>
                ${cuentaFocus.pendienteFacturar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </div>
              <span style={{ fontSize: '11px', color: cuentaFocus.pendienteFacturar > 0.01 ? '#92400e' : '#16a34a' }}>
                {cuentaFocus.pendienteFacturar > 0.01 ? 'Saldo pendiente de entrega' : 'Facturación al día'}
              </span>
            </div>
          </div>

          {formFacturaAbierto && (
            <form
              onSubmit={guardarFacturaRecibida}
              style={{ background: '#faf5ff', border: '1.5px solid #c084fc', borderRadius: '12px', padding: '18px', marginBottom: '20px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ margin: 0, color: '#581c87', fontSize: '15px' }}>
                  🧾 Cargar Factura Recibida de {cuentaFocus.prestador.nombre_prestador}
                </h4>
                <button type="button" onClick={() => setFormFacturaAbierto(false)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}>&times;</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: esCelular ? '1fr' : '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Fecha de Factura *</label>
                  <input
                    type="date"
                    value={fechaFactura}
                    onChange={(e) => setFechaFactura(e.target.value)}
                    required
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13.5px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>N° de Factura / Comp. *</label>
                  <input
                    type="text"
                    value={nroFactura}
                    onChange={(e) => setNroFactura(e.target.value)}
                    placeholder="Ej: 0001-00000142"
                    required
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13.5px', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>Importe Facturado ($) *</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={montoFactura}
                      onChange={(e) => setMontoFactura(e.target.value)}
                      placeholder="Ej: 45000"
                      required
                      style={{ flex: 1, minWidth: 0, padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13.5px', fontWeight: 'bold', color: '#15803d' }}
                    />
                    {cuentaFocus.pendienteFacturar > 0 && (
                      <button
                        type="button"
                        onClick={() => setMontoFactura(String(cuentaFocus.pendienteFacturar))}
                        title="Completar con el saldo pendiente de facturar"
                        style={{ padding: '0 8px', background: '#ede9fe', border: '1px solid #c4b5fd', color: '#5b21b6', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        ⚡ Saldo
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  value={obsFactura}
                  onChange={(e) => setObsFactura(e.target.value)}
                  placeholder="Observación opcional (ej: Corresponde a Noviembre 2026)..."
                  style={{ flex: 1, minWidth: '220px', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
                <button
                  type="submit"
                  disabled={guardandoFactura}
                  style={{ padding: '9px 18px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}
                >
                  {guardandoFactura ? 'Guardando...' : '✅ Guardar Factura'}
                </button>
              </div>
            </form>
          )}

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
            {[
              { id: 'TODOS', label: `Todos (${cuentaFocus.movimientosCuenta.length})` },
              { id: 'DEBE_FACTURAR', label: 'Solo A Facturar (Transferencias/QR)' },
              { id: 'FACTURAS', label: `Solo Facturas Recibidas (${cuentaFocus.cantFacturas})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFiltroDetalle(tab.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  border: filtroDetalle === tab.id ? '2px solid #7c3aed' : '1px solid #cbd5e1',
                  background: filtroDetalle === tab.id ? '#f5f3ff' : '#fff',
                  color: filtroDetalle === tab.id ? '#6d28d9' : '#475569'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {movimientosDetalleFiltrados.length === 0 ? (
            <p style={{ color: '#64748b', fontStyle: 'italic', background: '#f8fafc', padding: '24px', borderRadius: '8px', textAlign: 'center' }}>
              No hay movimientos de facturación registrados desde el 01/11/2026 para este criterio.
            </p>
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                    <th style={{ padding: '11px 10px' }}>Fecha</th>
                    <th style={{ padding: '11px 10px' }}>Tipo</th>
                    <th style={{ padding: '11px 10px' }}>Concepto / Comprobante</th>
                    <th style={{ padding: '11px 10px', textAlign: 'right' }}>Debe Facturar ($)</th>
                    <th style={{ padding: '11px 10px', textAlign: 'right' }}>Factura Recibida ($)</th>
                    <th style={{ padding: '11px 10px', textAlign: 'right' }}>Saldo Pendiente ($)</th>
                    <th style={{ padding: '11px 10px', textAlign: 'center' }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientosDetalleFiltrados.map((m, idx) => {
                    const esFac = m.tipoFila === 'FACTURA_RECIBIDA';
                    return (
                      <tr key={m.id_mov || idx} style={{ borderBottom: '1px solid #e2e8f0', background: esFac ? '#f0fdf4' : '#fff' }}>
                        <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#475569' }}>
                          {m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR') : 'S/F'}
                        </td>
                        <td style={{ padding: '9px 10px' }}>
                          <span style={{
                            padding: '2px 7px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            background: esFac ? '#dcfce7' : '#f3e8ff',
                            color: esFac ? '#15803d' : '#7e22ce'
                          }}>
                            {esFac ? '🧾 FACTURA' : '📈 A FACTURAR'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 10px', color: '#1e293b', fontWeight: '600' }}>
                          {m.concepto}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: '700', color: m.debeFacturar > 0 ? '#7e22ce' : '#94a3b8' }}>
                          {m.debeFacturar > 0 ? `$${m.debeFacturar.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: '700', color: m.facturaRecibida > 0 ? '#15803d' : '#94a3b8' }}>
                          {m.facturaRecibida > 0 ? `$${m.facturaRecibida.toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: '800', color: m.saldoFacturacion > 0.01 ? '#d97706' : '#15803d' }}>
                          ${m.saldoFacturacion.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </td>
                        <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                          {esFac && (
                            <button
                              type="button"
                              onClick={() => eliminarFacturaRecibida(m)}
                              title="Eliminar factura cargada"
                              style={{ background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', padding: '3px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                            >
                              🗑️
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
    </div>
  );
}
