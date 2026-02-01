import { test, expect } from '@playwright/test';

test.describe('AIKiosq E2E Flow', () => {
    test('Complete Kiosk User Journey', async ({ page }) => {
        page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
        // 1. Launch App
        await page.goto('/');
        await expect(page).toHaveTitle(/AIKiosq/i);
        await expect(page.getByText('System Offline')).toBeVisible();
        await expect(page).toHaveScreenshot('launch-offline.png', { maxDiffPixelRatio: 0.2 });

        // 2. Activate Sensors
        // Listener for status change
        const activateBtn = page.getByRole('button', { name: 'ACTIVATE SENSORS' });
        await activateBtn.waitFor({ state: 'visible', timeout: 60000 });
        // Button animates (bounces), so we force the click to avoid stability check timeouts
        await activateBtn.click({ force: true });

        // Verify Monitoring State
        await expect(page.getByText('SENSORS ACTIVE: Monitoring for Customer...')).toBeVisible();
        await expect(page.locator('video')).toBeVisible();
        await expect(page).toHaveScreenshot('sensors-active.png', {
            mask: [page.locator('video')],
            maxDiffPixelRatio: 0.2
        });

        // 3. Trigger Connection (Simulate Motion/Customer Approach)
        // We use the exposed test helper to bypass physical motion detection
        await page.evaluate(() => {
            // @ts-ignore
            if (window.triggerGeminiConnection) {
                // @ts-ignore
                window.triggerGeminiConnection();
            }
        });

        // 4. Verify Connection State
        // It should transition to "One moment..." or similar, then "Connected"
        // Note: In a real test without a real backend, the connection might fail or hang if API key is missing/invalid.
        // However, the status update happens BEFORE the connection call in App.tsx:
        // setCurrentStep('connecting'); setStatus(...) -> "Connecting to Gemini..."

        // 4. Verify Connection State
        // Target the status bar specifically to avoid ambiguity with logs/headers
        const statusText = page.locator('p.text-cyan-400');
        await expect(statusText).toContainText(/Connecting to Gemini/i);
        // Note: Connecting state is transient, skipping snapshot to avoid partial-transition flakes

        // 5. Test Shutdown
        // Wait a moment to ensure it doesn't crash immediately
        // 5. Expand Coverage: "I have a stuck valve" (Analyze Part Flow)

        await page.evaluate(async () => {
            // @ts-ignore
            if (!window.kioskHooks || !window.kioskHooks.handleAnalyzePart) {
                return;
            }

            // Mock the Analysis Service to avoid real API call
            // @ts-ignore
            window.kioskHooks.analysisService.analyzePartForReplacement = async () => {
                return {
                    partName: 'Stuck Brass Valve',
                    instructions: '1. Turn off water. 2. Use wrench.',
                    warnings: ['Hot water hazard'],
                    snapshotBase64: '' // App will fill this or we can omit
                };
            };

            // Trigger the interaction WITHOUT awaiting, so we can verify the UI transitions
            // @ts-ignore
            window.kioskHooks.handleAnalyzePart("I have a stuck valve").catch((e: unknown) => console.error("Analyze error:", e));
        });

        // 6. Verify Countdown
        await expect(page.getByRole('heading', { name: 'HOLD UP YOUR PART' }).first()).toBeVisible();
        await expect(page.getByText('Capturing in 3...').first()).toBeVisible();
        await expect(page).toHaveScreenshot('countdown.png', {
            mask: [page.locator('video')],
            maxDiffPixelRatio: 0.2
        });

        // 7. Verify Analysis Result (after mock returns)
        // The mock is instant, but the countdown takes 3 seconds
        await expect(page.getByText('PART IDENTIFIED: Stuck Brass Valve').first()).toBeVisible({ timeout: 10000 });
        await expect(page.getByText('1. Turn off water. 2. Use wrench.')).toBeVisible();
        await expect(page.getByText('Hot water hazard')).toBeVisible();

        // Snapshot result - mask video and the captured snapshot image (if displayed)
        await expect(page).toHaveScreenshot('analysis-result.png', {
            mask: [page.locator('video'), page.getByAltText('Snapshot')],
            maxDiffPixelRatio: 0.2
        });

        // 8. Test Shutdown
        await page.waitForTimeout(2000);

        const shutdownBtn = page.getByRole('button', { name: 'SHUTDOWN' });
        await expect(shutdownBtn).toBeVisible({ timeout: 5000 });
        await shutdownBtn.click({ force: true });

        await expect(page.getByText('System Offline')).toBeVisible();
    });
});
