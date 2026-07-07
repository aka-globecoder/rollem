import { rollDice } from './engine/dice';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <main style="font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; text-align: center;">
    <h1>Roll'Em</h1>
    <p>Push-your-luck dice game — MVP scaffold.</p>
    <button id="roll" style="font-size: 1.25rem; padding: 0.5rem 1.5rem; cursor: pointer;">Roll 5 dice</button>
    <p id="result" style="font-size: 2rem; letter-spacing: 0.5rem;"></p>
  </main>
`;

const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
document.querySelector<HTMLButtonElement>('#roll')!.addEventListener('click', () => {
  const dice = rollDice(5);
  document.querySelector<HTMLParagraphElement>('#result')!.textContent = dice
    .map((d) => faces[d - 1])
    .join(' ');
});
