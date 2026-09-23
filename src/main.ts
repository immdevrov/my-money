import { mount } from 'svelte';
import './ui/styles/tokens.css';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app mount point');

mount(App, { target });
