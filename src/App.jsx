import Layout from './components/layout/Layout';
import { GastosProvider } from '@/contexts/GastosContext';
export default function App() {
  return <GastosProvider><Layout /></GastosProvider>;
}
