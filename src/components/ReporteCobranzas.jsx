import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

export default function ReporteCobranzas({ onVolver, usuario }) {
  // Dates default to today
  const simulatedToday = localStorage.getItem('crin_fecha_trabajo_simulada') || new Date().toISOString().split('T')[0];
  const [fechaInicio, setFechaInicio] = useState(simulatedToday);
  const [fechaFin, setFechaFin] = useState(simulatedToday);
  const [cargando, setCargando] = useState(false);
  const [pagos, setPagos] = useState([]);
  const [pacientesMap, setPacientesMap] = useState({});

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

  useEffect(() => {
    async function cargarPacientes() {
      try {
        const { data, error } = await supabase
          .from('pacientes_motor')
          .select('id_paciente, nombre_apellido');
        if (error) throw error;
        
        const mapa = {};
        (data || []).forEach(p => {
          mapa[p.id_paciente] = p.nombre_apellido;
        });
        setPacientesMap(mapa);
      } catch (err) {
        console.error("Error al cargar pacientes:", err);
      }
    }
    cargarPacientes();
    consultarPagos(simulatedToday, simulatedToday);
  }, []);

  const consultarPagos = async (start, end) => {
    setCargando(true);
    try {
      const { data, error } = await supabase
        .from('pagos_motor')
        .select('*')
        .gte('fecha_pago', start)
        .lte('fecha_pago', end)
        .eq('estado', 'ACTIVO')
        .order('fecha_pago', { ascending: false });

      if (error) throw error;
      setPagos(data || []);
    } catch (err) {
      console.error("Error al consultar pagos:", err);
      alert("Error al consultar pagos: " + err.message);
    } finally {
      setCargando(false);
    }
  };

  const manejarFiltrar = () => {
    if (!fechaInicio || !fechaFin) {
      alert("Por favor seleccione ambas fechas.");
      return;
    }
    consultarPagos(fechaInicio, fechaFin);
  };

  const establecerHoy = () => {
    setFechaInicio(simulatedToday);
    setFechaFin(simulatedToday);
    consultarPagos(simulatedToday, simulatedToday);
  };

  const clasificarMedio = (medio) => {
    if (!medio) return 'OTRO';
    const m = String(medio).toUpperCase().trim();
    if (m === 'EFECTIVO' || m.includes('CAJA')) {
      return 'EFECTIVO';
    }
    if (m.includes('QR') || m.includes('MERCADOPAGO') || m.includes('MP') || m === 'UALA' || m === 'MODO') {
      return 'BILLETERA';
    }
    if (m.includes('TRANS') || m.includes('DEPO') || m === 'GALICIA' || m === 'SANTANDER' || m === 'MACRO' || m === 'BELO') {
      return 'BANCO';
    }
    return 'OTRO';
  };

  // Metricas
  let totalGeneral = 0;
  let totalEfectivo = 0;
  let totalBilletera = 0;
  let totalBanco = 0;
  let totalOtro = 0;

  pagos.forEach(p => {
    const imp = parsearDecimal(p.importe);
    totalGeneral += imp;
    
    const cat = clasificarMedio(p.forma_pago);
    if (cat === 'EFECTIVO') totalEfectivo += imp;
    else if (cat === 'BILLETERA') totalBilletera += imp;
    else if (cat === 'BANCO') totalBanco += imp;
    else totalOtro += imp;
  });

  const manejarDescargarExcel = () => {
    const BOM = "\uFEFF";
    let csv = "Fecha;Paciente;Forma de Pago;Concepto/Observación;Importe ($)\r\n";
    
    pagos.forEach(p => {
      const fecha = p.fecha_pago ? new Date(p.fecha_pago + 'T00:00:00').toLocaleDateString('es-AR') : 'S/F';
      const paciente = pacientesMap[p.id_paciente] || `Paciente #${p.id_paciente}`;
      const medio = p.forma_pago || 'S/D';
      const obs = (p.observacion || '-').replace(/;/g, ',');
      const importeStr = parsearDecimal(p.importe).toFixed(2).replace('.', ',');
      
      csv += `${fecha};${paciente};${medio};${obs};${importeStr}\r\n`;
    });
    
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Reporte_Cobranzas_${fechaInicio}_al_${fechaFin}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const esHoy = fechaInicio === simulatedToday && fechaFin === simulatedToday;

  return (
    <div style={{ background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', fontFamily: 'Segoe UI, system-ui, sans-serif', color: '#1e293b' }}>
      
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '20px', marginBottom: '25px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            📊 Resumen de Cobranzas {esHoy && <span style={{ background: '#ef4444', color: '#fff', fontSize: '11px', fontWeight: '800', padding: '3px 8px', borderRadius: '20px', letterSpacing: '0.05em' }}>HOY</span>}
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#64748b' }}>
            Consulte y exporte los cobros consolidados de pacientes por medios de pago
          </p>
        </div>
        <button
          onClick={onVolver}
          style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#475569', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600', transition: 'all 0.15s' }}
        >
          ← Volver al Menú
        </button>
      </div>

      {/* Panel de Filtros */}
      <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '25px', display: 'flex', flexWrap: 'wrap', gap: '15px', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Fecha Inicio</label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
          />
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '6px' }}>Fecha Fin</label>
          <input
            type="date"
            value={fechaFin}
            onChange={(e) => setFechaFin(e.target.value)}
            style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: '#fff' }}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={establecerHoy}
            style={{ background: '#e2e8f0', color: '#1e293b', border: 'none', padding: '11px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
          >
            📅 Hoy
          </button>
          <button
            onClick={manejarFiltrar}
            style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '11px 25px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
          >
            🔍 Filtrar y Calcular
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '25px' }}>
        
        <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', color: '#fff', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', opacity: 0.85, textTransform: 'uppercase' }}>Total General</span>
          <div style={{ fontSize: '26px', fontWeight: '800', marginTop: '4px' }}>
            ${totalGeneral.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '11px', opacity: 0.8, display: 'block', marginTop: '6px' }}>Todo lo cobrado en el período</span>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>💵 Efectivo (Caja)</span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#15803d', marginTop: '4px' }}>
            ${totalEfectivo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '6px' }}>Moneda física en caja</span>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>📱 Billeteras Virtuales</span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#7c3aed', marginTop: '4px' }}>
            ${totalBilletera.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '6px' }}>Mercado Pago / Ualá / MODO</span>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '20px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' }}>🏦 Cuentas Bancarias</span>
          <div style={{ fontSize: '24px', fontWeight: '800', color: '#2563eb', marginTop: '4px' }}>
            ${totalBanco.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </div>
          <span style={{ fontSize: '11px', color: '#94a3b8', display: 'block', marginTop: '6px' }}>Transferencias y depósitos</span>
        </div>

      </div>

      {/* Listado de Pagos */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#0f172a' }}>
            📄 Detalle de Cobros Registrados ({pagos.length})
          </h3>
          {pagos.length > 0 && (
            <button
              onClick={manejarDescargarExcel}
              style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              📥 Descargar Excel (CSV)
            </button>
          )}
        </div>

        {cargando ? (
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: '14px', padding: '40px' }}>Consultando base de datos...</p>
        ) : pagos.length === 0 ? (
          <div style={{ background: '#f8fafc', padding: '40px', borderRadius: '12px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '14px', color: '#64748b', fontStyle: 'italic' }}>
              No se registraron cobros activos en el período seleccionado.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left', background: '#fff' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569', borderBottom: '2px solid #cbd5e1' }}>
                  <th style={{ padding: '12px 10px' }}>Fecha</th>
                  <th style={{ padding: '12px 10px' }}>Paciente</th>
                  <th style={{ padding: '12px 10px' }}>Forma de Pago</th>
                  <th style={{ padding: '12px 10px' }}>Referencia / Imputación</th>
                  <th style={{ padding: '12px 10px', textAlign: 'right' }}>Importe ($)</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p) => {
                  const imp = parsearDecimal(p.importe);
                  return (
                    <tr key={p.id_pago} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background 0.15s' }}>
                      <td style={{ padding: '10px', whiteSpace: 'nowrap', fontWeight: '500', color: '#475569' }}>
                        {p.fecha_pago ? new Date(p.fecha_pago + 'T00:00:00').toLocaleDateString('es-AR') : 'S/F'}
                      </td>
                      <td style={{ padding: '10px', color: '#1e293b', fontWeight: '600' }}>
                        {pacientesMap[p.id_paciente] || `Paciente #${p.id_paciente}`}
                      </td>
                      <td style={{ padding: '10px', color: '#475569' }}>
                        <span style={{ fontSize: '11px', background: '#f1f5f9', padding: '3px 8px', borderRadius: '6px', fontWeight: 'bold' }}>
                          {p.forma_pago || 'S/D'}
                        </span>
                      </td>
                      <td style={{ padding: '10px', color: '#64748b' }}>
                        {p.observacion || '-'}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 'bold', color: '#16a34a' }}>
                        ${imp.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
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
