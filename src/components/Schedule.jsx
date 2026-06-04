
import { useEffect, useState }
from 'react'

import { supabase }
from '../lib/supabase.js'

function Schedule() {

  const [eventos, setEventos] =
    useState([])

  const [users, setUsers] =
    useState([])

  useEffect(() => {

    cargarAgenda()
    cargarUsuarios()

  }, [])

  async function cargarAgenda() {

    const { data } =
      await supabase

        .from('turnos')

.select('*')

.eq(
  'estado',
  'agendado'
)
        .order(
          'fecha_inicio',
          {
            ascending: true
          }
        )

    if (data) {

      setEventos(data)
    }
  }

  async function cargarUsuarios() {

    const { data } =
      await supabase

        .from('users')

        .select('*')

    if (data) {

      setUsers(data)
    }
  }

  function obtenerNombreProfesional(
    id
  ) {

    return users.find(
      (u) => u.id === id
    )?.nombre
  }

  function formatearFecha(
    fecha
  ) {

    return new Date(fecha)
      .toLocaleString(
        'es-AR',
        {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',

          hour: '2-digit',
          minute: '2-digit'
        }
      )
  }

  return (

    <div>

      <h1>
        Agenda
      </h1>

      {

        eventos.map(
          (evento) => (

            <div

              key={evento.id}

              style={{

                border:
                  '1px solid gray',

                padding: 15,

                marginBottom: 15,

                borderRadius: 10,

                backgroundColor:
                  'white'
              }}
            >

              <h3>

                {evento.tipo_turno}

              </h3>

              <p>

                Paciente:
                {' '}

                {
                  evento.paciente_nombre
                }

              </p>

              <p>

                Profesional:
                {' '}

                {
                  obtenerNombreProfesional(
                    evento.profesional_id
                  )
                }

              </p>

              <p>

                Fecha:
                {' '}

                {
                  formatearFecha(
                    evento.fecha_inicio
                  )
                }

              </p>

              <p>

                Estado:
                {' '}

                {evento.estado}

              </p>

            </div>
          )
        )
      }

    </div>
  )
}

export default Schedule

