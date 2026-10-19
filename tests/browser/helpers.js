export async function generatePattern(page) {
  const option = page.locator('.pattern-option');
  if (!await option.evaluate(element => element.open)) await option.locator('summary').click();
  await page.getByRole('button', { name: '定型文で下書きを作る', exact: true }).click();
}
