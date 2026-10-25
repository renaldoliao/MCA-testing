export type Dish = {
  id?: string;
  soldOut?: boolean;
  isNew?: boolean;
  name: string;
  chinese?: string;
  price: string;
  description?: string;
  spice?: string;
};

export type Category = {
  id: string;
  character: string;
  title: string;
  items: Dish[];
};