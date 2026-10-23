# Shared loading UI

`apps/desktop/src/components/loading.ts` exports a reusable, framework-independent DOM component. It uses EDITH letter tiles with thin borders, 6 px rounded corners and mint borders on the moving tile that slide along a row; the leftmost letter travels around the others to the right end, always passing above the row. A full five-move loop takes 3 seconds. Only the letter tiles are visible; status labels remain available to assistive technology. Animation is CSS-only; the component starts no polling and respects `prefers-reduced-motion`.

```ts
import { createLoading } from './components/loading';

const loading = createLoading({
  minimumDurationMs: 1500,
  label: 'Opening your workspace',
  description: 'Checking your session and access.',
});
container.append(loading.element);
loading.update('Preparing your workspace', 'Applying account permissions.');
// After the real operation finishes, including error cleanup:
await loading.waitForMinimum();
loading.destroy();
```

Use `compact: true` for smaller inline letter tiles inside a button. Labels are exposed through the loader's accessible name rather than visible text. Callers own operation state, cancellation, error messages and disabling controls. The optional `minimumDurationMs` defaults to 0. Await `waitForMinimum()` before removing or replacing the loader; it waits only for the remaining time, so slower operations receive no extra delay. `destroy()` still removes immediately. React callers can append its element to a ref container and call destroy from effect cleanup.

## Login integration

- Session and form loaders stay visible for at least 1500 ms, configurable through `LOADING_MINIMUM_DURATION_MS` in `accounts.ts`.
- The loading panel has no outer frame or background card; each letter has its own rounded border.
- A modal loading surface is created during the initial session check so the workspace does not briefly show before Login.
- Session check, Login/first-owner setup and successful authentication reuse one dialog/backdrop.
- Form submit collects values once, sets aria-busy, disables the submit button and shows the compact loader. Duplicate submissions are ignored.
- Invalid credentials keep the form open with inline error feedback and restore the button for retry.
- Successful Login/setup reloads access policy, not the browser page. An access-policy event updates the header, export controls and Gateway permissions before opening the workspace.
- A full loading panel covers account initialization; the dialog then fades out over 160 ms and returns focus to active navigation. Reduced-motion users skip the transition.
- Logout, self-role changes and revoked/expired sessions still reload the page to clear previous account data.
- Browser visual QA has not been completed; TypeScript/production frontend build and diff whitespace checks pass.
