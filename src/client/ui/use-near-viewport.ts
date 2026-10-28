import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/** Becomes true once the element comes within `margin` of the viewport, and stays true. */
export const useNearViewport = (ref: RefObject<Element | null>, margin = '800px'): boolean => {
  const [near, setNear] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (near || element === null) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
        }
      },
      { rootMargin: margin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, margin, near]);

  return near;
};
