
import { useEffect, useState }
from 'react'

import { supabase }
from './lib/supabase.js'


import AgendaMensualPro
from './components/AgendaMensualPro.jsx'


import AgendaFija
from './components/AgendaFija.jsx'



import Tasks
from './components/Tasks.jsx'



function App() {

  const [session, setSession] =
    useState(null)

  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  useEffect(() => {

    supabase.auth
      .getSession()

      .then(({ data }) => {

        setSession(
          data.session
        )
      })

    const {

      data: listener

    } = supabase.auth

      .onAuthStateChange(

        (_event, session) => {

          setSession(
            session
          )
        }
      )

    return () => {

      listener.subscription
        .unsubscribe()
    }

  }, [])

  async function login() {

    const { error } =

      await supabase.auth

        .signInWithPassword({

          email,
          password
        })

    if (error) {

      alert(
        'Login incorrecto'
      )
    }
  }

  async function logout() {

    await supabase.auth
      .signOut()
  }

  // LOGIN

  if (!session) {

    return (

      <div
        style={{
          padding: 20
        }}
      >

        <h1>
          CRIN
        </h1>

        <input

          type="email"

          placeholder="Email"

          value={email}

          onChange={(e) =>

            setEmail(
              e.target.value
            )
          }
        />

        <br /><br />

        <input

          type="password"

          placeholder="Password"

          value={password}

          onChange={(e) =>

            setPassword(
              e.target.value
            )
          }
        />

        <br /><br />

        <button
          onClick={login}
        >

          Ingresar

        </button>

      </div>
    )
  }

  // SISTEMA

  return (

    <div
      style={{
        padding: 20
      }}
    >

      <h1>
        CRIN
      </h1>

      <p>

        Usuario:
        {' '}

        {session.user.email}

      </p>

      
      <button
        onClick={logout}
      >

        Cerrar sesión

      </button>

      <hr />

      <AgendaMensualPro />

<hr />

<Tasks />


<hr />

<AgendaFija />




    
    </div>
  )
}

export default App


