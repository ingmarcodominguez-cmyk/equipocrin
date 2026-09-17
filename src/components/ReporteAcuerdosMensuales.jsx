import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase.js';
import Documentos from './Documentos.jsx';

export default function ReporteAcuerdosMensuales({ onVolver }) {
  const [acuerdos, setAcuerdos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroNombre, setFiltroNombre] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('TODOS'); // 'TODOS' | 'MENSUAL' | 'OBRA_SOCIAL'

  // Estados para el Modal de Documentos
  const [pacienteDocsModal, setPacienteDocsModal] = useState(null);
  const [verGestorCompleto, setVerGestorCompleto] = useState(false);
  const [copiadoId, setCopiadoId] = useState(null);

  useEffect(() => {
    async function cargarDatos() {
      setCargando(true);
      try {
        // 1. Consultar acuerdos mensuales activos
        const { data: acuerdosMensualesData, error: errAcM } = await supabase
          .from('acuerdos_motor')
          .select('*')
          .eq('estado', 'ACTIVO')
          .eq('tipo_acuerdo', 'MENSUAL');

        if (errAcM) throw errAcM;

        // 2. Consultar movimientos FACTURA_OS para identificar acuerdos facturados a Obras Sociales
        const { data: movsOSData, error: errMovs } = await supabase
          .from('movimientoscuenta_motor')
          .select('id_acuerdo, tipo_movimiento, subtipo, concepto, debe, fecha_movimiento')
          .eq('tipo_movimiento', 'FACTURA_OS');

        if (errMovs) throw errMovs;

        const acIdsFacturaOS = new Set((movsOSData || []).map(m => m.id_acuerdo).filter(Boolean));
        const subtiposPorAcuerdo = {};
        (movsOSData || []).forEach(m => {
          if (m.id_acuerdo && m.subtipo) subtiposPorAcuerdo[m.id_acuerdo] = m.subtipo;
        });

        // 3. Consultar acuerdos únicos activos (Obras Sociales)
        const { data: acuerdosUnicosData, error: errAcU } = await supabase
          .from('acuerdos_motor')
          .select('*')
          .eq('estado', 'ACTIVO')
          .eq('tipo_acuerdo', 'UNICO');

        if (errAcU) throw errAcU;

        const acuerdosOSFiltrados = (acuerdosUnicosData || []).filter(ac => {
          if (acIdsFacturaOS.has(ac.id_acuerdo)) return true;
          const obs = (ac.observaciones || '').toUpperCase();
          return obs.includes('OBRA SOCIAL') || obs.includes('FACTURADO O.S') || obs.includes('FACTURADO Y COBRADO O.S');
        });

        // 4. Consultar pacientes
        const { data: pacientesData, error: errPac } = await supabase
          .from('pacientes_motor')
          .select('id_paciente, nombre_apellido, obra_social, dni');

        if (errPac) throw errPac;

        const mapeoPacientes = {};
        (pacientesData || []).forEach(p => {
          mapeoPacientes[String(p.id_paciente)] = p;
        });

        // 5. Consultar prestaciones
        const { data: prestacionesData, error: errPres } = await supabase
          .from('prestaciones_motor')
          .select('id_prestacion, nombre_prestacion');

        if (errPres) throw errPres;

        const mapeoPrestaciones = {};
        (prestacionesData || []).forEach(pr => {
          mapeoPrestaciones[String(pr.id_prestacion)] = pr.nombre_prestacion;
        });

        // 6. Consultar documentos de pacientes
        const { data: docsData, error: errDocs } = await supabase
          .from('documentos_pacientes')
          .select('*')
          .order('fecha_subida', { ascending: false });

        if (errDocs) console.warn("Error al cargar documentos_pacientes:", errDocs);

        const mapeoDocumentos = {};
        (docsData || []).forEach(d => {
          const pid = String(d.id_paciente_excel);
          if (!mapeoDocumentos[pid]) mapeoDocumentos[pid] = [];
          mapeoDocumentos[pid].push(d);
        });

        // Mapear acuerdos Mensuales
        const listadoMensuales = (acuerdosMensualesData || []).map(ac => {
          const pacObj = mapeoPacientes[String(ac.id_paciente)];
          return {
            ...ac,
            nombre_paciente: pacObj ? pacObj.nombre_apellido : `Paciente ID: ${ac.id_paciente}`,
            obra_social: pacObj ? pacObj.obra_social || 'S/D' : 'S/D',
            dni: pacObj?.dni || '',
            nombre_prestacion: mapeoPrestaciones[String(ac.id_prestacion)] || `Prestación ID: ${ac.id_prestacion}`,
            tipo_origen: 'MENSUAL',
            documentos: mapeoDocumentos[String(ac.id_paciente)] || []
          };
        });

        // Mapear acuerdos de Obra Social:
        // "salvo los que se repitan, que pueden ser acuerdos mixtos"
        const pacientesConMensual = new Set(listadoMensuales.map(a => String(a.id_paciente)));
        const listadoOSNoRepetidos = [];
        const pacientesOSAgregados = new Set();

        for (const ac of acuerdosOSFiltrados) {
          const pid = String(ac.id_paciente);
          // Si el paciente ya está incluido con acuerdo mensual (acuerdo mixto), no duplicar
          if (pacientesConMensual.has(pid)) continue;
          // Si hay más de un acuerdo OS registrado para el mismo paciente, no duplicar
          if (pacientesOSAgregados.has(pid)) continue;
          pacientesOSAgregados.add(pid);

          const pacObj = mapeoPacientes[pid];

          // Determinar nombre de Obra Social
          let osNombre = subtiposPorAcuerdo[ac.id_acuerdo] || '';
          if (!osNombre && ac.observaciones) {
            const match = ac.observaciones.match(/Cobertura Obra Social:\s*([^[,\n]+)/i);
            if (match && match[1]) osNombre = match[1].trim();
          }
          if (!osNombre && pacObj?.obra_social) {
            osNombre = pacObj.obra_social.trim();
          }
          if (!osNombre) osNombre = 'OBRA SOCIAL';

          listadoOSNoRepetidos.push({
            ...ac,
            nombre_paciente: pacObj ? pacObj.nombre_apellido : `Paciente ID: ${ac.id_paciente}`,
            obra_social: osNombre,
            dni: pacObj?.dni || '',
            nombre_prestacion: mapeoPrestaciones[String(ac.id_prestacion)] || `Prestación ID: ${ac.id_prestacion}`,
            tipo_origen: 'OBRA_SOCIAL',
            documentos: mapeoDocumentos[pid] || []
          });
        }

        const listadoCompleto = [...listadoMensuales, ...listadoOSNoRepetidos];
        // Ordenar alfabéticamente por nombre del paciente
        listadoCompleto.sort((a, b) => a.nombre_paciente.localeCompare(b.nombre_paciente));

        setAcuerdos(listadoCompleto);
      } catch (error) {
        console.error("Error al cargar acuerdos mensuales y de obras sociales:", error);
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

  const obtenerUrlDoc = (urlStorage) => {
    if (!urlStorage) return '';
    if (urlStorage.startsWith('http://') || urlStorage.startsWith('https://')) return urlStorage;
    return `https://gqhfrzvtccxrixdtazzs.supabase.co/storage/v1/object/public/documentos_pacientes/${encodeURI(urlStorage)}`;
  };

  // Filtrar lista por tipo y texto de búsqueda
  const acuerdosFiltrados = useMemo(() => {
    return acuerdos.filter(ac => {
      // Filtro de pestaña / tipo
      if (filtroTipo === 'MENSUAL' && ac.tipo_origen !== 'MENSUAL') return false;
      if (filtroTipo === 'OBRA_SOCIAL' && ac.tipo_origen !== 'OBRA_SOCIAL') return false;

      // Filtro de texto
      const texto = filtroNombre.toLowerCase();
      return (
        ac.nombre_paciente.toLowerCase().includes(texto) ||
        ac.nombre_prestacion.toLowerCase().includes(texto) ||
        ac.obra_social.toLowerCase().includes(texto)
      );
    });
  }, [acuerdos, filtroTipo, filtroNombre]);

  // Contadores para pestañas
  const totalMensuales = useMemo(() => acuerdos.filter(a => a.tipo_origen === 'MENSUAL').length, [acuerdos]);
  const totalOS = useMemo(() => acuerdos.filter(a => a.tipo_origen === 'OBRA_SOCIAL').length, [acuerdos]);

  // Cálculos de KPIs
  const cantidadAcuerdos = acuerdosFiltrados.length;
  const facturacionTotal = acuerdosFiltrados.reduce((sum, ac) => sum + parsearMoneda(ac.importe_actual), 0);
  const valorPromedio = cantidadAcuerdos > 0 ? facturacionTotal / cantidadAcuerdos : 0;

  // Exportar a Excel (CSV con formato adecuado)
  const exportarExcel = () => {
    const encabezados = [
      'Paciente',
      'Documentos',
      'Tipo Acuerdo',
      'Obra Social',
      'Prestación',
      'Importe Base',
      'Importe Actual',
      'Día Vto',
      'Admite Recargo',
      'Fecha Acuerdo',
      'Observaciones'
    ];

    const filas = acuerdosFiltrados.map(ac => {
      const baseVal = parsearMoneda(ac.monto_cuota_base) > 0 ? parsearMoneda(ac.monto_cuota_base) : parsearMoneda(ac.importe_actual);
      const docsResumen = ac.documentos && ac.documentos.length > 0
        ? `${ac.documentos.length} doc(s): ${ac.documentos.map(d => d.nombre_archivo).join(' | ')}`
        : 'Sin documentos';

      return [
        ac.nombre_paciente,
        docsResumen,
        ac.tipo_origen === 'OBRA_SOCIAL' ? 'OBRA SOCIAL' : 'MENSUAL',
        ac.obra_social,
        ac.nombre_prestacion,
        baseVal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        parsearMoneda(ac.importe_actual).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ac.dia_vencimiento || '-',
        ac.admite_recargo || 'NO',
        ac.fecha_acuerdo || 'S/D',
        ac.observaciones || ''
      ];
    });

    const csvContent = [
      encabezados.join(';'),
      ...filas.map(fila => fila.map(campo => `"${String(campo).replace(/"/g, '""')}"`).join(';'))
    ].join('\r\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `acuerdos_activos_mensuales_y_os_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', background: '#fff', padding: '24px 28px', borderRadius: '14px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', color: '#1e293b' }}>
      
      {/* Cabecera */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '14px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '26px' }}>📅🤝</span>
          <div>
            <h2 style={{ color: '#0f172a', margin: 0, fontSize: '21px', fontWeight: 'bold' }}>
              Reporte de Acuerdos Activos
            </h2>
            <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
              Contratos mensuales vigentes y facturación activa de obras sociales (acuerdos mixtos unificados)
            </p>
          </div>
        </div>
        <button
          onClick={onVolver}
          style={{ background: '#64748b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', transition: 'background 0.2s', fontSize: '13px' }}
          onMouseOver={(e) => e.target.style.background = '#475569'}
          onMouseOut={(e) => e.target.style.background = '#64748b'}
        >
          ← Volver al Menú Principal
        </button>
      </div>

      {/* Tarjetas de Métricas (KPIs) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        
        {/* KPI 1: Cantidad de Acuerdos */}
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '16px 20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '12px', color: '#166534', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>Acuerdos Activos</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '26px', color: '#14532d', fontWeight: '800' }}>
            {cantidadAcuerdos}
          </h3>
          <p style={{ margin: '3px 0 0 0', fontSize: '11.5px', color: '#166534' }}>
            {filtroTipo === 'TODOS' ? `${totalMensuales} Particulares + ${totalOS} Obras Sociales` : 'Contratos vigentes en vista'}
          </p>
        </div>

        {/* KPI 2: Facturación Mensual Estimada */}
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '16px 20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '12px', color: '#1e40af', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>Facturación Mensual Total</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '26px', color: '#1e3a8a', fontWeight: '800' }}>
            ${facturacionTotal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p style={{ margin: '3px 0 0 0', fontSize: '11.5px', color: '#1e40af' }}>Suma de importes actuales activos</p>
        </div>

        {/* KPI 3: Valor Promedio */}
        <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '16px 20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
          <span style={{ fontSize: '12px', color: '#6b21a8', textTransform: 'uppercase', fontWeight: 'bold', letterSpacing: '0.5px' }}>Importe Promedio</span>
          <h3 style={{ margin: '6px 0 0 0', fontSize: '26px', color: '#581c87', fontWeight: '800' }}>
            ${valorPromedio.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p style={{ margin: '3px 0 0 0', fontSize: '11.5px', color: '#6b21a8' }}>Valor medio por acuerdo</p>
        </div>

      </div>

      {/* Pestañas de Selección de Tipo */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <button
          onClick={() => setFiltroTipo('TODOS')}
          style={{
            padding: '7px 14px',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: filtroTipo === 'TODOS' ? '#1e3a8a' : '#cbd5e1',
            background: filtroTipo === 'TODOS' ? '#1e3a8a' : '#f8fafc',
            color: filtroTipo === 'TODOS' ? '#fff' : '#475569',
            fontWeight: 'bold',
            fontSize: '12.5px',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          Todos ({acuerdos.length})
        </button>
        <button
          onClick={() => setFiltroTipo('MENSUAL')}
          style={{
            padding: '7px 14px',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: filtroTipo === 'MENSUAL' ? '#0284c7' : '#cbd5e1',
            background: filtroTipo === 'MENSUAL' ? '#0284c7' : '#f8fafc',
            color: filtroTipo === 'MENSUAL' ? '#fff' : '#475569',
            fontWeight: 'bold',
            fontSize: '12.5px',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          Particulares Mensuales ({totalMensuales})
        </button>
        <button
          onClick={() => setFiltroTipo('OBRA_SOCIAL')}
          style={{
            padding: '7px 14px',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: filtroTipo === 'OBRA_SOCIAL' ? '#d97706' : '#cbd5e1',
            background: filtroTipo === 'OBRA_SOCIAL' ? '#d97706' : '#f8fafc',
            color: filtroTipo === 'OBRA_SOCIAL' ? '#fff' : '#475569',
            fontWeight: 'bold',
            fontSize: '12.5px',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          Obras Sociales ({totalOS})
        </button>
      </div>

      {/* Barra de Filtros y Controles */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="text"
            placeholder="🔍 Buscar por paciente, obra social o prestación..."
            value={filtroNombre}
            onChange={(e) => setFiltroNombre(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', background: '#f8fafc', boxSizing: 'border-box' }}
          />
        </div>
        <button
          onClick={exportarExcel}
          style={{ background: '#10b981', color: '#fff', border: 'none', padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', transition: 'background 0.2s', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)', whiteSpace: 'nowrap' }}
          onMouseOver={(e) => e.target.style.background = '#059669'}
          onMouseOut={(e) => e.target.style.background = '#10b981'}
        >
          📥 Descargar Excel
        </button>
      </div>

      {/* Tabla de Reporte */}
      {cargando ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
          <p style={{ fontSize: '14px', fontWeight: '500' }}>Cargando acuerdos activos y documentos...</p>
        </div>
      ) : acuerdosFiltrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
          <p style={{ color: '#64748b', fontStyle: 'italic', margin: 0 }}>No se encontraron acuerdos activos que coincidan con la búsqueda.</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid #cbd5e1', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', background: '#fff', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', color: '#334155', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '10px 8px', fontWeight: 'bold' }}>Paciente</th>
                <th style={{ padding: '10px 8px', fontWeight: 'bold', textAlign: 'center' }}>Documentos</th>
                <th style={{ padding: '10px 8px', fontWeight: 'bold', textAlign: 'center' }}>Tipo</th>
                <th style={{ padding: '10px 8px', fontWeight: 'bold' }}>Obra Social</th>
                <th style={{ padding: '10px 8px', fontWeight: 'bold' }}>Prestación</th>
                <th style={{ padding: '10px 8px', fontWeight: 'bold', textAlign: 'right' }}>Imp. Base</th>
                <th style={{ padding: '10px 8px', fontWeight: 'bold', textAlign: 'right' }}>Imp. Actual</th>
                <th style={{ padding: '10px 8px', fontWeight: 'bold', textAlign: 'center' }}>Vto (Día)</th>
                <th style={{ padding: '10px 8px', fontWeight: 'bold', textAlign: 'center' }}>Recargo</th>
                <th style={{ padding: '10px 8px', fontWeight: 'bold' }}>Fecha Acuerdo</th>
                <th style={{ padding: '10px 8px', fontWeight: 'bold' }}>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              {acuerdosFiltrados.map((ac, idx) => {
                const baseNum = parsearMoneda(ac.monto_cuota_base);
                const actualVal = parsearMoneda(ac.importe_actual);
                const baseVal = baseNum > 0 ? baseNum : actualVal;

                return (
                  <tr key={ac.id_acuerdo || idx} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#fff' : '#f8fafc' }}>
                    
                    {/* Paciente */}
                    <td style={{ padding: '10px 8px', fontWeight: 'bold', color: '#0f172a' }}>
                      {ac.nombre_paciente}
                    </td>

                    {/* Documentos del Paciente */}
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      {ac.documentos && ac.documentos.length > 0 ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <a
                            href={obtenerUrlDoc(ac.documentos[0].url_storage)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              border: '1px solid #bfdbfe',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '700',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                              whiteSpace: 'nowrap'
                            }}
                            title={`Abrir archivo: ${ac.documentos[0].nombre_archivo}`}
                          >
                            📄 {ac.documentos.length === 1 ? 'Doc ↗' : `${ac.documentos.length} docs ↗`}
                          </a>
                          <button
                            onClick={() => {
                              setPacienteDocsModal(ac);
                              setVerGestorCompleto(false);
                            }}
                            style={{
                              background: '#f8fafc',
                              border: '1px solid #cbd5e1',
                              borderRadius: '4px',
                              padding: '2px 5px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              color: '#475569'
                            }}
                            title="Ver listado completo de documentos"
                          >
                            👁️
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setPacienteDocsModal(ac);
                            setVerGestorCompleto(false);
                          }}
                          style={{
                            background: 'none',
                            border: '1px dashed #cbd5e1',
                            color: '#94a3b8',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10.5px',
                            cursor: 'pointer'
                          }}
                          title="Sin documentos cargados. Clic para ver o adjuntar"
                        >
                          + Doc
                        </button>
                      )}
                    </td>

                    {/* Tipo: MENSUAL u OBRA SOCIAL */}
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '9.5px',
                        fontWeight: 'bold',
                        background: ac.tipo_origen === 'OBRA_SOCIAL' ? '#fef3c7' : '#e0f2fe',
                        color: ac.tipo_origen === 'OBRA_SOCIAL' ? '#b45309' : '#0369a1',
                        border: `1px solid ${ac.tipo_origen === 'OBRA_SOCIAL' ? '#fde68a' : '#bae6fd'}`,
                        whiteSpace: 'nowrap'
                      }}>
                        {ac.tipo_origen === 'OBRA_SOCIAL' ? 'O. SOCIAL' : 'MENSUAL'}
                      </span>
                    </td>

                    {/* Obra Social */}
                    <td style={{ padding: '10px 8px', color: '#475569', fontWeight: '500' }}>
                      {ac.obra_social}
                    </td>

                    {/* Prestación */}
                    <td style={{ padding: '10px 8px', color: '#1e3a8a', fontWeight: '500' }}>
                      {ac.nombre_prestacion}
                    </td>

                    {/* Imp. Base */}
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '600', color: '#475569' }}>
                      ${baseVal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Imp. Actual */}
                    <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700', color: '#2563eb' }}>
                      ${actualVal.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>

                    {/* Día Vencimiento */}
                    <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 'bold', color: '#b45309' }}>
                      {ac.dia_vencimiento || '-'}
                    </td>

                    {/* Recargo */}
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: '4px', background: ac.admite_recargo === 'SI' ? '#fee2e2' : '#f1f5f9', color: ac.admite_recargo === 'SI' ? '#991b1b' : '#475569', fontSize: '10px', fontWeight: 'bold' }}>
                        {ac.admite_recargo || 'NO'}
                      </span>
                    </td>

                    {/* Fecha Acuerdo */}
                    <td style={{ padding: '10px 8px', color: '#475569', whiteSpace: 'nowrap' }}>
                      {ac.fecha_acuerdo}
                    </td>

                    {/* Observaciones */}
                    <td style={{ padding: '10px 8px', color: '#64748b', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ac.observaciones}>
                      {ac.observaciones || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Documentos del Paciente */}
      {pacienteDocsModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: verGestorCompleto ? '1100px' : '650px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            overflow: 'hidden'
          }}>
            {verGestorCompleto ? (
              <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                  <button
                    onClick={() => setVerGestorCompleto(false)}
                    style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '6px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', color: '#334155', fontSize: '13px' }}
                  >
                    ← Volver a lista simple de documentos
                  </button>
                  <button
                    onClick={() => { setPacienteDocsModal(null); setVerGestorCompleto(false); }}
                    style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#64748b' }}
                  >
                    ✕
                  </button>
                </div>
                <Documentos
                  pacientePreseleccionado={{
                    id_paciente: pacienteDocsModal.id_paciente,
                    id_paciente_excel: pacienteDocsModal.id_paciente,
                    nombre: pacienteDocsModal.nombre_paciente,
                    nombre_apellido: pacienteDocsModal.nombre_paciente,
                    dni: pacienteDocsModal.dni,
                    obra_social: pacienteDocsModal.obra_social
                  }}
                  esEmbebido={true}
                  onVolver={() => setVerGestorCompleto(false)}
                />
              </div>
            ) : (
              <>
                {/* Cabecera del Modal */}
                <div style={{ padding: '18px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', color: '#0f172a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      📁 Documentos del Paciente
                    </h3>
                    <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>
                      <strong>{pacienteDocsModal.nombre_paciente}</strong> (ID: {pacienteDocsModal.id_paciente}) • O.S: {pacienteDocsModal.obra_social}
                    </p>
                  </div>
                  <button
                    onClick={() => setPacienteDocsModal(null)}
                    style={{ background: '#e2e8f0', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold', color: '#475569', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    ✕
                  </button>
                </div>

                {/* Contenido / Lista de Documentos */}
                <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                  {(!pacienteDocsModal.documentos || pacienteDocsModal.documentos.length === 0) ? (
                    <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748b' }}>
                      <span style={{ fontSize: '40px', display: 'block', marginBottom: '8px' }}>📭</span>
                      <p style={{ fontSize: '13.5px', margin: '0 0 16px 0' }}>Este paciente no tiene documentos cargados actualmente.</p>
                      <button
                        onClick={() => setVerGestorCompleto(true)}
                        style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
                      >
                        📂 Abrir Gestor para Subir Documentos
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <span style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#334155' }}>
                          Archivos registrados ({pacienteDocsModal.documentos.length}):
                        </span>
                        <button
                          onClick={() => setVerGestorCompleto(true)}
                          style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#2563eb', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                        >
                          + Subir más / Administrar
                        </button>
                      </div>
                      {pacienteDocsModal.documentos.map((doc, idx) => {
                        const url = obtenerUrlDoc(doc.url_storage);
                        const fechaStr = doc.fecha_subida ? new Date(doc.fecha_subida).toLocaleDateString('es-AR') : '';
                        return (
                          <div
                            key={doc.id || idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              background: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              borderRadius: '10px',
                              gap: '12px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                              <span style={{ fontSize: '22px' }}>📄</span>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: '600', fontSize: '13px', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={doc.nombre_archivo}>
                                  {doc.nombre_archivo}
                                </div>
                                {fechaStr && (
                                  <div style={{ fontSize: '11px', color: '#64748b' }}>
                                    Subido: {fechaStr}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  background: '#2563eb',
                                  color: '#fff',
                                  textDecoration: 'none',
                                  padding: '6px 12px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: '600',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                Abrir ↗
                              </a>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(url);
                                  setCopiadoId(doc.id);
                                  setTimeout(() => setCopiadoId(null), 2000);
                                }}
                                style={{
                                  background: copiadoId === doc.id ? '#10b981' : '#f1f5f9',
                                  color: copiadoId === doc.id ? '#fff' : '#475569',
                                  border: '1px solid #cbd5e1',
                                  padding: '6px 10px',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  cursor: 'pointer',
                                  fontWeight: '500'
                                }}
                                title="Copiar enlace directo"
                              >
                                {copiadoId === doc.id ? '¡Copiado!' : '📋 Copiar'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Pie del Modal */}
                <div style={{ padding: '12px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setPacienteDocsModal(null)}
                    style={{ background: '#64748b', color: '#fff', border: 'none', padding: '7px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12.5px' }}
                  >
                    Cerrar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
