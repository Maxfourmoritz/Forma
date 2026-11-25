import { render } from 'preact';
import { App } from './app';
import { registerSW } from './sw-register';
import './styles.css';

render(<App />, document.getElementById('app')!);
(window as unknown as { __formaBootOk?: () => void }).__formaBootOk?.();
registerSW();

