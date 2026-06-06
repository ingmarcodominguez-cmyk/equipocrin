
import { useState }

from 'react'

import AgendaMensualPro
from './AgendaMensualPro.jsx'

import AgendaFija
from './AgendaFija.jsx'

import Tasks
from './Tasks.jsx'

import Dashboard
from './Dashboard.jsx'

function Layout({

  userData,

  logout

}) {

  const [

    vista,

    setVista

  ] = useState(
    'dashboard'
  )

  return (

    <div

      style={{

        display: 'flex',

        minHeight: '100vh'
      }}
    >

      <div

        style={{

          width: 250,

          backgroundColor:
            '#0f172a',

          color:
            'white',

          padding: 20
        }}
      >

        <h2>
          CRIN
        </h2>

        <p>

          {
            userData?.nombre
          }

        </p>

        <p>

          {
            userData?.rol
          }

        </p>

        <hr />

        <div
          style={{
            marginTop: 30
          }}
        >

          <button

            onClick={() =>
              setVista(
                'dashboard'
              )
            }
          >

            Menú

          </button>

        </div>

        <br /><br />

        <button
          onClick={logout}
        >

          Cerrar sesión

        </button>

      </div>

      <div

        style={{

          flex: 1,

          padding: 20
        }}
      >

        {

          vista ===
            'dashboard'

          &&

          <Dashboard

            userData={
              userData
            }

            setVista={
              setVista
            }

          />
        }

        {

          vista ===
            'agenda'

          &&

          <AgendaMensualPro

            userData={
              userData
            }

          />
        }

        {

          vista ===
            'tareas'

          &&

          <Tasks

            userData={
              userData
            }

          />
        }

        {

          vista ===
            'profesionales'

          &&

          <AgendaFija

            userData={
              userData
            }

          />
        }

      </div>

    </div>
  )
}

export default Layout

