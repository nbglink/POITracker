import { Calculator } from './pages/Calculator';
import { SettingsProvider } from './context/SettingsContext';

function App() {
  return (
    <SettingsProvider>
      <Calculator />
    </SettingsProvider>
  );
}

export default App;