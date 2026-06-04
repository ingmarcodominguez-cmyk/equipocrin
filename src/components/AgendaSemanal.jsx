
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

function AgendaSemanal() {

  const [turnos, setTurnos] =
    useState([])

  
useEffect(() => {

  cargarTurnos()

  const intervalo =

    setInterval(() => {

      cargarTurnos()

    }, 3000)

  return () =>
    clearInterval(
      intervalo
    )

}, [])



  async function cargarTurnos() {

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

      setTurnos(data)
    }
  }

  const diasSemana = [

    'Domingo',
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado'
  ]

  return (

    <div>

      <h1>
        Agenda semanal
      </h1>

      <div

        style={{

          display: 'grid',

          gridTemplateColumns:
            'repeat(7, 1fr)',

          gap: 15,

          alignItems: 'start'
        }}
      >

        {

          diasSemana.map(
            (dia, index) => {

              const turnosDia =

                turnos

                  .filter(
                    (turno) => {

                      const fecha =

                        new Date(
                          turno.fecha_inicio
                        )

                      return (

                        fecha.getDay()
                        ===
                        index
                      )
                    }
                  )

                  .sort(
                    (a, b) =>

                      new Date(
                        a.fecha_inicio
                      )

                      -

                      new Date(
                        b.fecha_inicio
                      )
                  )

              return (

                <div

                  key={dia}

                  style={{

                    border:
                      '1px solid lightgray',

                    borderRadius: 10,

                    padding: 10,

                    minHeight: 400,

                    backgroundColor:
                      '#f8f8f8'
                  }}
                >

                  <h2>

                    {dia}

                  </h2>

                  {

                    turnosDia.map(
                      (turno) => (

                        <div

                          key={turno.id}

                          style={{

                            backgroundColor:
                              'white',

                            border:
                              '1px solid gray',

                            borderRadius: 8,

                            padding: 8,

                            marginBottom: 10
                          }}
                        >

                          <strong>

                            {

                              turno.fecha_inicio

                                .split('T')[1]

                                .substring(0, 5)
                            }

                          </strong>

                          <br />

                          {
                            turno
                              .paciente_nombre
                          }

                          <br />

                          <small>

                            {
                              turno.tipo_turno
                            }

                          </small>

                        </div>
                      )
                    )
                  }

                </div>
              )
            }
          )
        }

      </div>

    </div>
  )
}

export default AgendaSemanal

