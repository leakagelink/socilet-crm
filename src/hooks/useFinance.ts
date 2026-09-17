import { useQuery } from "@tanstack/react-query";
import { loadFinance } from "@/lib/finance";

export function useFinance() {
  return useQuery({
    queryKey: ["finance"],
    queryFn: loadFinance,
    refetchInterval: 30_000,
  });
}
