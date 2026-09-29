import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAmount, profitColumns, holdingProfit, profitSummary } from '../app/profit.mjs';

test('reads signed bank amounts, but never treats absent data as zero', () => {
  assert.equal(parseAmount('₪1,234.50'), 1234.5);
  assert.equal(parseAmount('(1,234.50)'), -1234.5);
  assert.equal(parseAmount('-123.40'), -123.4);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('-'), null);
});

test('finds total cost and reported profit, and does not assume per-unit price is ILS', () => {
  const headers = profitColumns(['שם נייר', 'שווי בש"ח', 'עלות רכישה בש"ח', 'רווח/הפסד בש"ח', 'שער קניה']);
  assert.deepEqual(headers, { totalCost: 2, unitCost: 4, profitIls: 3 });
  assert.deepEqual(holdingProfit(['A', 120, 100, 20, 10], headers, 120), { costBasisIls: 100, profitIls: 20 });
  assert.deepEqual(holdingProfit(['A', 120, 100, '', 10], headers, 120), { costBasisIls: 100, profitIls: 20 });
  assert.deepEqual(holdingProfit(['A', 120, '', '', 10], headers, 120), { costBasisIls: null, profitIls: null });
});

test('negative profits and partial coverage survive aggregation', () => {
  assert.deepEqual(profitSummary([{profitIls: -20}, {profitIls: 50}, {profitIls: null}]), { profitIls: 30, known: 2, unknown: 1 });
});
