import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { UniqueIdentifier } from '@dnd-kit/core';

export function SortablePlayerWrapper({ id, children }: { id: UniqueIdentifier; children: React.ReactNode }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 1,
        opacity: isDragging ? 0.8 : 1,
        scale: isDragging ? 1.05 : 1,
        position: 'relative' as const,
        height: '100%',
        flex: 1,
        display: 'flex',
        flexDirection: 'column' as const,
        touchAction: 'none'
    };

    return (
        <div ref={setNodeRef} style={style}>
            {React.Children.map(children, child => {
                if (React.isValidElement(child)) {
                    return React.cloneElement(child, {
                        dragAttributes: attributes,
                        dragListeners: listeners,
                        isDragging
                    } as any);
                }
                return child;
            })}
        </div>
    );
}
