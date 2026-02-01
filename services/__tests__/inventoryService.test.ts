import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InventoryService } from '../inventoryService';

// Mock data
const mockInventory = {
    items: [
        {
            id: 'valve-001',
            name: 'Quarter Turn Water Shut-Off Valve',
            category: 'valves',
            keywords: ['valve', 'shut-off', 'water', 'quarter turn'],
            aisle: 'Aisle 5 - Undersink Repair',
            stock: 3,
            price: 16.99,
            description: 'Chrome plated brass valve'
        },
        {
            id: 'tape-001',
            name: 'Pipe Thread Seal Tape',
            category: 'adhesives',
            keywords: ['tape', 'teflon', 'seal', 'thread'],
            aisle: 'Aisle 5',
            stock: 50,
            price: 1.79,
            description: 'PTFE tape for sealing pipe threads'
        },
        {
            id: 'fitting-002',
            name: 'Compression Nut & Ferrule',
            category: 'fittings',
            keywords: ['compression', 'fitting', 'nut', 'ferrule'],
            aisle: 'Aisle 5',
            stock: 10,
            price: 2.99,
            description: 'Brass compression nut and sleeve'
        }
    ]
};

describe('InventoryService', () => {
    let service: InventoryService;

    beforeEach(() => {
        service = new InventoryService();
        // Mock fetch
        global.fetch = vi.fn().mockResolvedValue({
            json: () => Promise.resolve(mockInventory),
        });
    });

    it('loads inventory correctly', async () => {
        await service.loadInventory();
        // We can't access private property 'inventory' directly easily in TS without @ts-ignore or brackets
        // But we can verify search works, which implies it loaded.
        const results = service.searchItems('valve');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('valve-001');
    });

    it('handles load errors gracefully', async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
        await service.loadInventory();
        const results = service.searchItems('valve');
        expect(results).toHaveLength(0);
    });

    it('searches items by name/keyword', async () => {
        await service.loadInventory();

        // Search by name
        let results = service.searchItems('shut-off');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('valve-001');

        // Search by keyword
        results = service.searchItems('teflon');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('tape-001');
    });

    it('filters by multiple terms', async () => {
        await service.loadInventory();
        const results = service.searchItems('shut-off valve');
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('valve-001');
    });

    it('returns empty array if not loaded', () => {
        // New service without loadInventory called
        const newService = new InventoryService();
        const results = newService.searchItems('valve');
        expect(results).toHaveLength(0);
    });

    it('suggests complementary items for valves', async () => {
        await service.loadInventory();
        const complements = service.getComplementaryItems('valve-001');
        expect(complements.some(i => i.id === 'tape-001')).toBe(true);
    });

    it('suggests complementary items for compression fittings', async () => {
        await service.loadInventory();
        // Fitting-002 is compression
        const complements = service.getComplementaryItems('fitting-002');
        // Logic says it suggests tape or fitting-002? Wait, the code says:
        // if (item.category === 'fittings' && item.keywords.includes('compression')) {
        //   return this.inventory.items.filter(i => i.id === 'fitting-002' || i.id === 'tape-001');
        // }
        // It suggests itself? That mimics the code logic I read, even if slightly odd.
        expect(complements.length).toBeGreaterThan(0);
        expect(complements.some(i => i.id === 'tape-001')).toBe(true);
    });

    it('formats item info correctly', async () => {
        await service.loadInventory();
        const item = mockInventory.items[0];
        const text = service.formatItemInfo(item);
        expect(text).toContain('Quarter Turn Water Shut-Off Valve');
        expect(text).toContain('$16.99');
        expect(text).toContain('3 in stock');
    });
});
