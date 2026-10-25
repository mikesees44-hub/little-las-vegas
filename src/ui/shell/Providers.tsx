import type { ReactNode } from 'react';
import { ClarityContext, type ClarityApi } from '../clarity/context';
import { OrdersContext, type OrdersApi } from '../components/Orders';
import { SheetContext } from '../components/People';
import { PlannerContext } from '../components/Schemes';
import { TravelContext, type TravelApi } from '../travel/context';
import type { SchemeKind, SchemeOptions } from '../../engine/types';
import { ShellContext, type ShellApi } from './context';

/** Every "open X from anywhere" context the screens use, in one place. */
export function Providers({ sheet, clarity, planner, orders, travel, shell, children }: {
  sheet: { open: (id: string) => void; menu?: (id: string, category?: string) => void };
  clarity: ClarityApi;
  planner: { plan: (kind: SchemeKind, targetId?: string, opts?: Partial<SchemeOptions>) => void };
  orders: OrdersApi;
  travel: TravelApi;
  shell: ShellApi;
  children: ReactNode;
}) {
  return (
    <ShellContext.Provider value={shell}>
      <SheetContext.Provider value={sheet}>
        <ClarityContext.Provider value={clarity}>
          <PlannerContext.Provider value={planner}>
            <OrdersContext.Provider value={orders}>
              <TravelContext.Provider value={travel}>{children}</TravelContext.Provider>
            </OrdersContext.Provider>
          </PlannerContext.Provider>
        </ClarityContext.Provider>
      </SheetContext.Provider>
    </ShellContext.Provider>
  );
}
