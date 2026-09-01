import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase.js';

export default function ReporteAcuerdosMensuales({ onVolver }) {
  const [acuerdos, setAcuerdos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroNombre, setFiltroNombre] = useState('');

  useEffect(() => {
    async function cargarDatos() {
      setCargando(true);
      try {
        // 1. Fetch agreements
        const { data: acuerdosData, error: errAc } = await supabase
          .from('acuerdos_motor')
          .select('*')
          .eq('estado', 'ACTIVO')
          .eq('tipo_acuerdo', 'MENSUAL');

        if (errAc) throw errAc;

        // 2. Fetch patients
        const { data: pacientesData, error: errPac } = await supabase
          .from('pacientes_motor')
          .select('id_paciente, nombre_apellido, obra_social');

        if (errPac) throw errPac;

        // 3. Fetch prestations
        const { data: prestacionesData, error: errPres } = await supabase
          .from('prestaciones_motor')
          .select('id_prestacion, nombre_prestacion');

        if (errPres) throw errPres;

        // Map everything together
        const mapeoPacientes = {};
        (pacientesData || []).forEach(p => {
          mapeoPacientes[String(p.id_paciente)] = p;
        });

        const mapeoPrestaciones = {};
        (prestacionesData || []).forEach(pr => {
          mapeoPrestaciones[String(pr.id_prestacion)] = pr.nombre_prestacion;
        });

        const listado = (acuerdosData || []).map(ac => {
          const pacObj = mapeoPacientes[String(ac.id_paciente)];
          return {
            ...ac,
            nombre_paciente: pacObj ? pacObj.nombre_apellido : `Paciente ID: ${ac.id_paciente}`,
            obra_social: pacObj ? pacObj.obra_social || 'S/D' : 'S/D',
            nombre_prestacion: mapeoPrestaciones[String(ac.id_prestacion)] || `Prestación ID: ${ac.id_prestacion}`
          };
        });

        // Sort by patient name alphabetically
        listado.sort((a, b) => a.nombre_paciente.localeCompare(b.nombre_paciente));

        setAcuerdos(listado);
      } catch (error) {
        console.error("Error al cargar acuerdos mensuales activos:", error);
        alert("Error al cargar la información: " + error.message);
      } finally {
        setCargando(false);
      }
    }

    cargarDatos();
  }, []);

  const parsearMoneda = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    const str = String(val).replace(/\$/g, '').trim();
    if (str.includes(',')) {
      const num = Number(str.replace(/\./g, '').replace(',', '.'));
      return isNaN(num) ? 0 : num;
    }
    if (str.includes('.')) {
      const partes = str.split('.');
      if (partes.length > 2 || partes[1].length === 3) {
        const num = Number(str.replace(/\./g, ''));
        return isNaN(num) ? 0 : num;
      }
      const num = Number(str);
      return isNaN(num) ? 0 : num;
    }
    const num = Number(str);
    return isNaN(num) ? 0 : num;
  };

  // Filter list by patient name or prestation
  const acuerdosFiltrados = acuerdos.filter(ac => 
    ac.nombre_paciente.toLowerCase().includes(filtroNombre.toLowerCase()) ||
    ac.nombre_prestacion.toLowerCase().includes(filtroNombre.toLowerCase())
  );

  // Calculations
  const cantidadAcuerdos = acuerdosFiltrados.length;
  const facturacionTotal = acuerdosFiltrados.reduce((sum, ac) => sum + parsearMoneda(ac.importe_actual), 0);
  const valorPromedio = cantidadAcuerdos > 0 ? facturacionTotal / cantidadAcuerdos : 0;

  // Export to Excel (CSV delimited by semicolon with BOM)
  const exportarExcel = () => {
    const encabezados = [
      'Paciente',
      'Obra Social',
      'Prestación',
      'Importe Base',
      'Importe Actual',
      'Día Vto',
      'Admite Recargo',
      'Fecha Acuerdo',
      'Observaciones'
    ];

    const filas = acuerdosFiltrados.map(ac => [
      ac.nombre_paciente,
      ac.obra_social,
      ac.nombre_prestacion,
      parsearMoneda(ac.monto_cuota_base).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      parsearMoneda(ac.importe_actual).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      ac.dia_vencimiento || 'S/D',
      ac.admite_recargo || 'NO',
      ac.fecha_acuerdo || 'S/D',
      ac.observaciones || ''
    ]);

    const csvContent = [
      encabezados.join(';'),
      ...filas.map(fila => fila.map(campo => `"${String(campo).replace(/"/g, '""')}"`).join(';'))
    ].join('\r\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `acuerdos_mensuales_activos_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', background: '#fff', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', color: '#1e293b' }}>
      
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '15px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '28px' }}>📅🤝</span>
          <h2 style={{ color: '#0f172a', margin: 0, fontSize: '22px', fontWeight: 'bold' }}>Reporte de Acuerdos Mensuales Activos</h2>
        </div>
        <button
          onClick={onVolver}
          style={{ background: '#64748b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', transition: 'background 0.2s' }}
          onMouseOver={(e) => e.target.style.background = '#475569'}
          onMouseOut={(e) => e.target.style.background = '#64748b'}
        >
          ← Volver al Menú Principal
        </button>
      </div>

      {/* Tarjetas de Métricas (KPIs) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '25px' }}>
        
        {/* KPI 1: Cantidad de Acuerdos */}
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '13px', color: '#166534', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>Acuerdos Activos</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '28px', color: '#14532d', fontWeight: '800' }}>
            {cantidadAcuerdos}
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#166534' }}>Contratos mensuales vigentes</p>
        </div>

        {/* KPI 2: Facturación Mensual Estimada */}
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '13px', color: '#1e40af', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>Facturación Mensual Total</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '28px', color: '#1e3a8a', fontWeight: '800' }}>
            ${facturacionTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#1e40af' }}>Suma de importes actuales</p>
        </div>

        {/* KPI 3: Valor Promedio */}
        <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '13px', color: '#6b21a8', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>Importe Promedio</span>
          <h3 style={{ margin: '8px 0 0 0', fontSize: '28px', color: '#581c87', fontWeight: '800' }}>
            ${valorPromedio.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b21a8' }}>Valor medio por acuerdo</p>
        </div>

      </div>

      {/* Barra de Filtros y Controles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            placeholder="🔍 Buscar por nombre del paciente o prestación..."
            value={filtroNombre}
            onChange={(e) => setFiltroNombre(e.target.value)}
            style={{ width: '100%', padding: '12px 12px 12px 35px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#f8fafc' }}
          />
          <span style={{ position: 'absolute', left: '12px', top: '13px', color: '#64748b' }}></span>
        </div>
        <button
          onClick={exportarExcel}
          style={{ background: '#10b981', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)' }}
          onMouseOver={(e) => e.target.style.background = '#059669'}
          onMouseOut={(e) => e.target.style.background = '#10b981'}
        >
          📥 Descargar Excel
        </button>
      </div>

      {/* Tabla de Reporte */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          <p style={{ fontSize: '15px', fontWeight: '500' }}>Cargando acuerdos mensuales activos...</p>
        </div>
      ) : acuerdosFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <p style={{ color: '#64748b', fontStyle: 'italic', margin: 0 }}>No se encontraron acuerdos mensuales activos que coincidan con la búsqueda.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', background: '#fff', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#334155', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '12px 10px', fontWeight: 'bold' }}>Paciente</th>
                <th style={{ padding: '12px 10px', fontWeight: 'bold' }}>Obra Social</th>
                <th style={{ padding: '12px 10px', fontWeight: 'bold' }}>Prestación</th>
                <th style={{ padding: '12px 10px', fontWeight: 'bold', textAlign: 'right' }}>Imp. Base</th>
                <th style={{ padding: '12px 10px', fontWeight: 'bold', textAlign: 'right' }}>Imp. Actual</th>
                <th style={{ padding: '12px 10px', fontWeight: 'bold', textAlign: 'center' }}>Vto (Día)</th>
                <th style={{ padding: '12px 10px', fontWeight: 'bold', textAlign: 'center' }}>Recargo</th>
                <th style={{ padding: '12px 10px', fontWeight: 'bold' }}>Fecha Acuerdo</th>
                <th style={{ padding: '12px 10px', fontWeight: 'bold' }}>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {acuerdosFiltrados.map((ac, idx) => {
                const baseVal = parsearMoneda(ac.monto_cuota_base);
                const actualVal = parsearMoneda(ac.importe_actual);
                return (
                  <tr key={ac.id_acuerdo || idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    <td style={{ padding: '12px 10px', fontWeight: 'bold', color: '#0f172a' }}>
                      {ac.nombre_paciente}
                    </td>
                    <td style={{ padding: '12px 10px', color: '#475569' }}>
                      {ac.obra_social}
                    </td>
                    <td style={{ padding: '12px 10px', color: '#1e3a8a', fontWeight: '500' }}>
                      {ac.nombre_prestacion}
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>
                      ${baseVal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '700', color: '#2563eb' }}>
                      ${actualVal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 'bold', color: '#b45309' }}>
                      {ac.dia_vencimiento || '-'}
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: '4px', background: ac.admite_recargo === 'SI' ? '#fee2e2' : '#f1f5f9', color: ac.admite_recargo === 'SI' ? '#991b1b' : '#475569', fontSize: '10px', fontWeight: 'bold' }}>
                        {ac.admite_recargo || 'NO'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 10px', color: '#475569' }}>
                      {ac.fecha_acuerdo}
                    </td>
                    <td style={{ padding: '12px 10px', color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ac.observaciones}>
                      {ac.observaciones || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
