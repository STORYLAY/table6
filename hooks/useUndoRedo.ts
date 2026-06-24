
import { useState, useCallback } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export default function useUndoRedo<T>(initialState: T) {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: []
  });

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const setState = useCallback((newStateOrCb: T | ((prev: T) => T)) => {
    setHistory(curr => {
      const newState = typeof newStateOrCb === 'function' 
        ? (newStateOrCb as (prev: T) => T)(curr.present)
        : newStateOrCb;

      if (newState === curr.present) return curr;

      // 限制历史记录长度，防止内存溢出 (例如50步)
      const newPast = [...curr.past, curr.present].slice(-50);

      return {
        past: newPast,
        present: newState,
        future: [] // 一旦有新操作，未来的重做记录失效
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory(curr => {
      if (curr.past.length === 0) return curr;

      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, -1);

      return {
        past: newPast,
        present: previous,
        future: [curr.present, ...curr.future]
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory(curr => {
      if (curr.future.length === 0) return curr;

      const next = curr.future[0];
      const newFuture = curr.future.slice(1);

      return {
        past: [...curr.past, curr.present],
        present: next,
        future: newFuture
      };
    });
  }, []);

  return {
    state: history.present,
    setState,
    undo,
    redo,
    canUndo,
    canRedo
  };
}
