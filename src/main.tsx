import { render } from 'preact'
import './styles/tokens.css'
import './styles/base.css'
import './styles/layout.css'
import './styles/components.css'
import './styles/pages.css'
import { App } from './app'

render(<App />, document.getElementById('app')!)
