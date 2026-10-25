import { createContext, useContext } from 'react';

/** Opening a house page from anywhere (a character sheet, a spouse's badge, the history). */
export const HousesNavContext = createContext<{ openHouse: (id: string) => void }>({ openHouse: () => {} });

export function useHousesNav() {
  return useContext(HousesNavContext);
}
