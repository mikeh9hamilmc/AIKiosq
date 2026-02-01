import React from 'react';

export const TestVideoPlayer: React.FC = () => {
    return (
        <div className="p-4 border rounded shadow-md bg-white">
            <h2 className="text-xl font-bold mb-4">Test Video Player</h2>
            <div className="relative w-full" style={{ paddingBottom: '56.25%', height: 0 }}>
                <iframe
                    src="https://drive.google.com/file/d/10KwB1Xwn-njQUI4tnmIcwlS8-w3Frvni/preview"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                    frameBorder="0"
                    allow="autoplay"
                    title="Test Video"
                ></iframe>
            </div>
        </div>
    );
};
