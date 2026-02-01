import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PlumbingThreadTeacher from '../PlumbingThreadTeacher';
import { LessonStage } from '../../types';

describe('PlumbingThreadTeacher', () => {
    it('renders idle state correctly', () => {
        render(<PlumbingThreadTeacher lessonStage={LessonStage.IDLE} />);
        expect(screen.getByText(/WAITING FOR NEW CUSTOMER/i)).toBeInTheDocument();
    });

    it('renders comparison diagram', () => {
        render(<PlumbingThreadTeacher lessonStage={LessonStage.COMPARE_THREADS} />);
        expect(screen.getByText(/IPS \(NPT\)/i)).toBeInTheDocument();
        expect(screen.getByText(/COMPRESSION/i)).toBeInTheDocument();
    });

    it('renders highlight ferrule state', () => {
        render(<PlumbingThreadTeacher lessonStage={LessonStage.HIGHLIGHT_FERRULE} />);
        expect(screen.getByText(/SEAL POINT/i)).toBeInTheDocument();
    });

    it('renders analyzing part spinner', () => {
        render(<PlumbingThreadTeacher lessonStage={LessonStage.ANALYZING_PART} />);
        expect(screen.getByText(/GEMINI 3 ANALYSIS/i)).toBeInTheDocument();
        expect(screen.getByText(/Mac is examining your part/i)).toBeInTheDocument();
    });

    it('renders snapshot countdown', () => {
        render(<PlumbingThreadTeacher lessonStage={LessonStage.COUNTDOWN_TO_SNAPSHOT} countdownValue={3} />);
        expect(screen.getByText(/HOLD UP YOUR PART/i)).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('renders analysis results', () => {
        const mockAnalysis = {
            partName: 'Test Valve',
            instructions: 'Replace with care.',
            warnings: ['Turn off water first'],
            snapshotBase64: 'fakebase64'
        };
        render(
            <PlumbingThreadTeacher
                lessonStage={LessonStage.SHOWING_ANALYSIS}
                partAnalysis={mockAnalysis}
            />
        );
        expect(screen.getByText(/PART IDENTIFIED: Test Valve/i)).toBeInTheDocument();
        expect(screen.getByText(/Replace with care/i)).toBeInTheDocument();
        expect(screen.getByText(/Turn off water first/i)).toBeInTheDocument();
    });

    it('renders inventory results', () => {
        const mockInventory = [{
            id: '1',
            name: 'Test Item',
            category: 'test',
            aisle: 'Aisle 1',
            stock: 5,
            price: 10.99,
            description: 'A test item',
            keywords: []
        }]; // Added required missing props from interface if any

        render(
            <PlumbingThreadTeacher
                lessonStage={LessonStage.SHOWING_INVENTORY}
                inventoryItems={mockInventory}
            />
        );
        expect(screen.getByText('Test Item')).toBeInTheDocument();
        expect(screen.getByText('$10.99')).toBeInTheDocument();
        expect(screen.getByText(/5 in stock/i)).toBeInTheDocument();
    });

    it('renders aisle sign', () => {
        render(
            <PlumbingThreadTeacher
                lessonStage={LessonStage.SHOWING_AISLE}
                aisleSignPath="/test-sign.jpg"
            />
        );
        expect(screen.getByText(/FIND IT HERE/i)).toBeInTheDocument();
        const img = screen.getByRole('img', { name: /aisle sign/i });
        expect(img).toHaveAttribute('src', '/test-sign.jpg');
    });
});
