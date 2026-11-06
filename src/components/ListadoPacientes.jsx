import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase.js';
import * as XLSX from 'xlsx';

// Helper para limpiar y preparar el número para enlace oficial de WhatsApp en Argentina y global
export function limpiarTelefonoWhatsApp(tel) {
  if (!tel) return null;
  let digits = String(tel).replace(/\D/g, '');
  if (digits.length < 7) return null; // Descartar textos como 'S/D', '0', o incompletos

  // Si inicia con 0 (código de área nacional ej. 0381...), remover 0
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  // Si ya tiene el prefijo internacional con el 9 móvil de Argentina (ej. 549381...)
  if (digits.startsWith('549')) {
    return digits;
  }

  // Si tiene 54 pero no el 9 móvil
  if (digits.startsWith('54')) {
    return '549' + digits.slice(2);
  }

  // Número local habitual de Argentina (10 dígitos sin 0 ni 15, ej 3816406533)
  return '549' + digits;
}

export default function ListadoPacientes({ onVolver, onAbrirFicha }) {
  const [pacientes, setPacientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroTel, setFiltroTel] = useState('todos'); // 'todos' | 'con_tel' | 'sin_tel'
  const [filtroEstado, setFiltroEstado] = useState('todos'); // 'todos' | 'ACTIVO' | 'INACTIVO'
  const [orden, setOrden] = useState('nombre_asc'); // 'nombre_asc' | 'nombre_desc' | 'id_desc' | 'id_asc'
  
  // Feedback copiado
  const [copiadoId, setCopiadoId] = useState(null);

  useEffect(() => {
    cargarPacientes();
  }, []);

  async function cargarPacientes() {
    setCargando(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('pacientes_motor')
        .select('*')
        .order('nombre_apellido', { ascending: true });

      if (err) throw err;
      setPacientes(data || []);
    } catch (err) {
      console.error('Error al cargar pacientes:', err);
      setError(err.message || 'Error al conectar con la base de datos.');
    } finally {
      setCargando(false);
    }
  }

  const copiarAlPortapapeles = (texto, idClave) => {
    if (!texto) return;
    navigator.clipboard.writeText(texto).then(() => {
      setCopiadoId(idClave);
      setTimeout(() => setCopiadoId(null), 2000);
    }).catch(() => {
      // Fallback
      alert(`Número copiado: ${texto}`);
    });
  };

  // Pacientes filtrados y ordenados
  const pacientesFiltrados = useMemo(() => {
    let list = [...pacientes];

    // Filtro por texto
    if (busqueda.trim()) {
      const term = busqueda.trim().toLowerCase();
      list = list.filter(p => {
        const nom = (p.nombre_apellido || '').toLowerCase();
        const dni = (p.dni || '').toString();
        const tel1 = (p.tel_padres || '').toString().toLowerCase();
        const tel2 = (p.tel_alternativo || '').toString().toLowerCase();
        const os = (p.obra_social || '').toLowerCase();
        const tutor1 = (p.nombre_padre || '').toLowerCase();
        const tutor2 = (p.nombre_madre || '').toLowerCase();
        const idStr = (p.id_paciente || '').toString();

        return nom.includes(term) ||
               dni.includes(term) ||
               tel1.includes(term) ||
               tel2.includes(term) ||
               os.includes(term) ||
               tutor1.includes(term) ||
               tutor2.includes(term) ||
               idStr === term;
      });
    }

    // Filtro por disponibilidad de teléfono
    if (filtroTel === 'con_tel') {
      list = list.filter(p => Boolean(limpiarTelefonoWhatsApp(p.tel_padres) || limpiarTelefonoWhatsApp(p.tel_alternativo)));
    } else if (filtroTel === 'sin_tel') {
      list = list.filter(p => !limpiarTelefonoWhatsApp(p.tel_padres) && !limpiarTelefonoWhatsApp(p.tel_alternativo));
    }

    // Filtro por estado
    if (filtroEstado !== 'todos') {
      list = list.filter(p => {
        const est = (p.estado || '').toUpperCase();
        return est === filtroEstado;
      });
    }

    // Ordenamiento
    list.sort((a, b) => {
      if (orden === 'nombre_asc') {
        return (a.nombre_apellido || '').localeCompare(b.nombre_apellido || '');
      }
      if (orden === 'nombre_desc') {
        return (b.nombre_apellido || '').localeCompare(a.nombre_apellido || '');
      }
      if (orden === 'id_desc') {
        return (b.id_paciente || 0) - (a.id_paciente || 0);
      }
      if (orden === 'id_asc') {
        return (a.id_paciente || 0) - (b.id_paciente || 0);
      }
      return 0;
    });

    return list;
  }, [pacientes, busqueda, filtroTel, filtroEstado, orden]);

  // Contadores KPIs
  const stats = useMemo(() => {
    const total = pacientes.length;
    const conWhatsApp = pacientes.filter(p => Boolean(limpiarTelefonoWhatsApp(p.tel_padres) || limpiarTelefonoWhatsApp(p.tel_alternativo))).length;
    const sinTel = total - conWhatsApp;
    const activos = pacientes.filter(p => (p.estado || '').toUpperCase() === 'ACTIVO').length;
    return { total, conWhatsApp, sinTel, activos };
  }, [pacientes]);

  // Exportar a Excel
  const exportarAExcel = () => {
    if (pacientesFiltrados.length === 0) {
      alert('No hay pacientes para exportar con los filtros seleccionados.');
      return;
    }

    const dataExcel = pacientesFiltrados.map(p => {
      const waPadres = limpiarTelefonoWhatsApp(p.tel_padres);
      const waAlt = limpiarTelefonoWhatsApp(p.tel_alternativo);
      return {
        'ID': p.id_paciente,
        'Paciente': p.nombre_apellido || '',
        'DNI': p.dni || '',
        'Estado': p.estado || 'S/D',
        'Obra Social': p.obra_social || '',
        'Nro Afiliado': p.nro_afiliado || '',
        'Teléfono Padres': p.tel_padres || '',
        'Link WhatsApp Padres': waPadres ? `https://wa.me/${waPadres}` : '',
        'Teléfono Alternativo': p.tel_alternativo || '',
        'Link WhatsApp Alternativo': waAlt ? `https://wa.me/${waAlt}` : '',
        'Tel. Docente Integrador': p.tel_docente_integrador || '',
        'Nombre Padre': p.nombre_padre || '',
        'Nombre Madre': p.nombre_madre || '',
        'Domicilio': p.domicilio || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataExcel);
    worksheet['!cols'] = [
      { wch: 8 },  // ID
      { wch: 32 }, // Paciente
      { wch: 12 }, // DNI
      { wch: 12 }, // Estado
      { wch: 20 }, // Obra Social
      { wch: 16 }, // Nro Afiliado
      { wch: 18 }, // Tel Padres
      { wch: 32 }, // Link WA Padres
      { wch: 18 }, // Tel Alt
      { wch: 32 }, // Link WA Alt
      { wch: 18 }, // Tel Docente
      { wch: 22 }, // Padre
      { wch: 22 }, // Madre
      { wch: 28 }, // Domicilio
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Contactos Pacientes');
    const hoy = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `listado_pacientes_crin_${hoy}.xlsx`);
  };

  return (
    <div style={{
      width: '100%',
      maxWidth: '1240px',
      margin: '0 auto',
      background: '#ffffff',
      borderRadius: '16px',
      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.08)',
      border: '1px solid #e2e8f0',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Encabezado */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid #e2e8f0',
        background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 50%, #ffffff 100%)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            fontSize: '32px',
            background: '#25D366',
            color: '#fff',
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 10px rgba(37, 211, 102, 0.35)'
          }}>
            💬
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: '#14532d' }}>
              Directorio de Pacientes y Contacto WhatsApp
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#4b5563' }}>
              Listado completo con enlace directo a chat de WhatsApp y acceso inmediato a la Ficha del Paciente.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={exportarAExcel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 15px',
              background: '#047857',
              color: '#ffffff',
              border: 'none',
              borderRadius: '9px',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
              boxShadow: '0 2px 5px rgba(4, 120, 87, 0.25)',
              transition: 'background 0.15s'
            }}
            onMouseOver={(e) => e.currentTarget.style.background = '#065f46'}
            onMouseOut={(e) => e.currentTarget.style.background = '#047857'}
            title="Descargar tabla en formato Excel"
          >
            📊 Exportar Excel
          </button>

          {onVolver && (
            <button
              onClick={onVolver}
              style={{
                padding: '9px 16px',
                background: '#ffffff',
                color: '#4b5563',
                border: '1px solid #cbd5e1',
                borderRadius: '9px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'all 0.15s'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = '#f8fafc'}
              onMouseOut={(e) => e.currentTarget.style.background = '#ffffff'}
            >
              ← Volver al Menú
            </button>
          )}
        </div>
      </div>

      {/* Tarjetas de Estadísticas / KPIs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        padding: '16px 24px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0'
      }}>
        <div style={{
          background: '#ffffff',
          padding: '12px 16px',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Total Pacientes</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#1e293b', marginTop: '2px' }}>{stats.total}</div>
          </div>
          <span style={{ fontSize: '24px' }}>👥</span>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '12px 16px',
          borderRadius: '10px',
          border: '1px solid #bbf7d0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#15803d', textTransform: 'uppercase' }}>Con WhatsApp</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#16a34a', marginTop: '2px' }}>{stats.conWhatsApp}</div>
          </div>
          <span style={{ fontSize: '24px' }}>📱</span>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '12px 16px',
          borderRadius: '10px',
          border: '1px solid #fed7aa',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#c2410c', textTransform: 'uppercase' }}>Sin Teléfono</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#ea580c', marginTop: '2px' }}>{stats.sinTel}</div>
          </div>
          <span style={{ fontSize: '24px' }}>⚠️</span>
        </div>

        <div style={{
          background: '#ffffff',
          padding: '12px 16px',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Pacientes Activos</div>
            <div style={{ fontSize: '20px', fontWeight: '800', color: '#0284c7', marginTop: '2px' }}>{stats.activos}</div>
          </div>
          <span style={{ fontSize: '24px' }}>✅</span>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div style={{
        padding: '16px 24px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #e2e8f0',
        background: '#ffffff'
      }}>
        {/* Input Buscador */}
        <div style={{ flex: '1 1 320px', position: 'relative' }}>
          <input
            type="text"
            placeholder="🔍 Buscar por Nombre, DNI, Teléfono u Obra Social..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 36px 10px 14px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              fontSize: '14px',
              outline: 'none',
              transition: 'border-color 0.15s',
              boxSizing: 'border-box'
            }}
            onFocus={(e) => e.target.style.borderColor = '#10b981'}
            onBlur={(e) => e.target.style.borderColor = '#cbd5e1'}
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '4px'
              }}
              title="Borrar búsqueda"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filtro por Teléfono */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Teléfono:</span>
          <select
            value={filtroTel}
            onChange={(e) => setFiltroTel(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              background: '#fff',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="todos">Todos ({stats.total})</option>
            <option value="con_tel">Con WhatsApp ({stats.conWhatsApp})</option>
            <option value="sin_tel">Sin Teléfono ({stats.sinTel})</option>
          </select>
        </div>

        {/* Filtro por Estado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Estado:</span>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              background: '#fff',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="todos">Todos los estados</option>
            <option value="ACTIVO">Solo Activos</option>
            <option value="INACTIVO">Solo Inactivos</option>
          </select>
        </div>

        {/* Orden */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Ordenar:</span>
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              background: '#fff',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            <option value="nombre_asc">Nombre (A - Z)</option>
            <option value="nombre_desc">Nombre (Z - A)</option>
            <option value="id_desc">Más recientes (ID ↓)</option>
            <option value="id_asc">ID inicial (ID ↑)</option>
          </select>
        </div>

        <button
          onClick={cargarPacientes}
          style={{
            padding: '8px 12px',
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            color: '#334155',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600'
          }}
          title="Recargar datos"
        >
          🔄 Refrescar
        </button>
      </div>

      {/* Contador de resultados */}
      <div style={{
        padding: '8px 24px',
        background: '#f8fafc',
        fontSize: '12.5px',
        color: '#64748b',
        borderBottom: '1px solid #f1f5f9',
        display: 'flex',
        justifyContent: 'space-between'
      }}>
        <span>Mostrando <strong>{pacientesFiltrados.length}</strong> de {pacientes.length} pacientes</span>
        {busqueda && (
          <span style={{ color: '#059669', fontWeight: '600' }}>
            Filtro activo: &ldquo;{busqueda}&rdquo;
          </span>
        )}
      </div>

      {/* Contenido / Tabla */}
      <div style={{ flex: 1, overflowX: 'auto', maxHeight: '68vh', overflowY: 'auto' }}>
        {cargando ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>⏳</div>
            <div style={{ fontSize: '16px', fontWeight: '600' }}>Cargando lista de pacientes...</div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>Conectando a Supabase</div>
          </div>
        ) : error ? (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: '#b91c1c' }}>
            <div style={{ fontSize: '30px', marginBottom: '8px' }}>⚠️</div>
            <div style={{ fontSize: '15px', fontWeight: '700' }}>{error}</div>
            <button
              onClick={cargarPacientes}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Reintentar
            </button>
          </div>
        ) : pacientesFiltrados.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#64748b' }}>
            <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#334155' }}>No se encontraron pacientes</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
              Probá modificando los términos de búsqueda o los filtros aplicados.
            </div>
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                style={{
                  marginTop: '12px',
                  padding: '7px 14px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: '#2563eb'
                }}
              >
                Limpiar búsqueda
              </button>
            )}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
            <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 5, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <th style={{ padding: '12px 16px', width: '60px', textAlign: 'center' }}>ID</th>
                <th style={{ padding: '12px 16px' }}>Paciente</th>
                <th style={{ padding: '12px 16px' }}>Obra Social / DNI</th>
                <th style={{ padding: '12px 16px' }}>Teléfono Principal / Padres</th>
                <th style={{ padding: '12px 16px' }}>Teléfono Alternativo</th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Ficha del Paciente</th>
              </tr>
            </thead>
            <tbody>
              {pacientesFiltrados.map((p, idx) => {
                const waPadres = limpiarTelefonoWhatsApp(p.tel_padres);
                const waAlt = limpiarTelefonoWhatsApp(p.tel_alternativo);
                const esActivo = (p.estado || '').toUpperCase() === 'ACTIVO';

                return (
                  <tr
                    key={p.id_paciente}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                      transition: 'background 0.15s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#f0fdf4'}
                    onMouseOut={(e) => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafafa'}
                  >
                    {/* ID */}
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: '#64748b' }}>
                      <span style={{ background: '#f1f5f9', padding: '3px 7px', borderRadius: '6px', fontSize: '12px' }}>
                        #{p.id_paciente}
                      </span>
                    </td>

                    {/* Paciente */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <button
                          onClick={() => onAbrirFicha && onAbrirFicha(p)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: '#1d4ed8',
                            fontWeight: '700',
                            fontSize: '14.5px',
                            cursor: 'pointer',
                            textAlign: 'left',
                            textDecoration: 'underline'
                          }}
                          title="Hacer clic para abrir la Ficha completa de este paciente"
                        >
                          👤 {p.nombre_apellido}
                        </button>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '11.5px', color: '#64748b' }}>
                          <span style={{
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: '700',
                            fontSize: '10.5px',
                            background: esActivo ? '#dcfce7' : '#fee2e2',
                            color: esActivo ? '#166534' : '#991b1b'
                          }}>
                            {p.estado || 'S/D'}
                          </span>
                          {p.nombre_padre && <span>Padre: {p.nombre_padre}</span>}
                          {p.nombre_madre && <span>Madre: {p.nombre_madre}</span>}
                        </div>
                      </div>
                    </td>

                    {/* Obra Social / DNI */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: '600', color: '#334155' }}>
                        {p.obra_social || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Sin Obra Social</span>}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        DNI: <span style={{ fontWeight: '600' }}>{p.dni || 'S/D'}</span>
                        {p.nro_afiliado && ` | Af: ${p.nro_afiliado}`}
                      </div>
                    </td>

                    {/* Teléfono Principal / Padres + WhatsApp */}
                    <td style={{ padding: '12px 16px' }}>
                      {waPadres ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '600', color: '#1e293b', fontSize: '13.5px' }}>
                            {p.tel_padres}
                          </span>
                          
                          {/* Botón directo de WhatsApp */}
                          <a
                            href={`https://wa.me/${waPadres}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              background: '#25D366',
                              color: '#ffffff',
                              padding: '5px 11px',
                              borderRadius: '7px',
                              textDecoration: 'none',
                              fontWeight: '700',
                              fontSize: '12px',
                              boxShadow: '0 2px 4px rgba(37, 211, 102, 0.25)',
                              transition: 'transform 0.1s, background 0.15s'
                            }}
                            onMouseOver={(e) => {
                              e.currentTarget.style.background = '#1ebd59';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.background = '#25D366';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                            title={`Abrir WhatsApp con ${p.tel_padres}`}
                          >
                            <span>💬</span>
                            <span>WhatsApp</span>
                          </a>

                          {/* Botón Copiar */}
                          <button
                            onClick={() => copiarAlPortapapeles(p.tel_padres, `p_${p.id_paciente}`)}
                            style={{
                              background: copiadoId === `p_${p.id_paciente}` ? '#dcfce7' : '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '4px 7px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              color: copiadoId === `p_${p.id_paciente}` ? '#166534' : '#475569',
                              fontWeight: '600'
                            }}
                            title="Copiar número"
                          >
                            {copiadoId === `p_${p.id_paciente}` ? '✓ Copiado' : '📋 Copiar'}
                          </button>
                        </div>
                      ) : p.tel_padres ? (
                        <div style={{ color: '#475569', fontSize: '13px' }}>
                          <span>{p.tel_padres}</span>
                          <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px' }}>(No móvil)</span>
                        </div>
                      ) : (
                        <span style={{ color: '#94a3b8', fontSize: '12.5px', fontStyle: 'italic' }}>
                          Sin registrar
                        </span>
                      )}
                    </td>

                    {/* Teléfono Alternativo + WhatsApp */}
                    <td style={{ padding: '12px 16px' }}>
                      {waAlt ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: '600', color: '#334155', fontSize: '13px' }}>
                            {p.tel_alternativo}
                          </span>
                          <a
                            href={`https://wa.me/${waAlt}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              background: '#10b981',
                              color: '#ffffff',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              textDecoration: 'none',
                              fontWeight: '700',
                              fontSize: '11px',
                              transition: 'background 0.15s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.background = '#059669'}
                            onMouseOut={(e) => e.currentTarget.style.background = '#10b981'}
                            title={`Abrir WhatsApp con alternativo: ${p.tel_alternativo}`}
                          >
                            <span>💬</span>
                            <span>WA Alt</span>
                          </a>
                        </div>
                      ) : p.tel_alternativo ? (
                        <span style={{ color: '#64748b', fontSize: '12.5px' }}>{p.tel_alternativo}</span>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>—</span>
                      )}

                      {p.tel_docente_integrador && (
                        <div style={{ fontSize: '11px', color: '#475569', marginTop: '3px' }}>
                          Docente: {p.tel_docente_integrador}
                        </div>
                      )}
                    </td>

                    {/* Hipervínculo / Botón Ficha del Paciente */}
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <button
                        onClick={() => onAbrirFicha && onAbrirFicha(p)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'linear-gradient(135deg, #fffaf0 0%, #feebc8 100%)',
                          color: '#744210',
                          border: '1.5px solid #fbd38d',
                          padding: '7px 14px',
                          borderRadius: '8px',
                          fontWeight: '800',
                          fontSize: '12px',
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
                          transition: 'all 0.15s'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.05)';
                        }}
                        title={`Ir a la Ficha de ${p.nombre_apellido}`}
                      >
                        <span>📂</span>
                        <span>Ver Ficha</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pie de tabla */}
      <div style={{
        padding: '12px 24px',
        borderTop: '1px solid #e2e8f0',
        background: '#f8fafc',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '12.5px',
        color: '#64748b'
      }}>
        <span>
          💡 <strong>Tip:</strong> Puedes hacer clic sobre el nombre del paciente o el botón <strong>&quot;Ver Ficha&quot;</strong> para abrir su historial completo, asistencias y cuenta corriente.
        </span>
        <span>
          Sistema Crin • Contactos y WhatsApp
        </span>
      </div>
    </div>
  );
}
