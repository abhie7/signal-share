const adjectives = [
  'Fuzzy', 'Sneaky', 'Bouncy', 'Cosmic', 'Glowing', 'Mystic', 'Zippy', 'Wobbly',
  'Sparkly', 'Cheeky', 'Quirky', 'Jolly', 'Nimble', 'Bashful', 'Breezy', 'Dapper',
  'Funky', 'Giddy', 'Feisty', 'Peppy', 'Sassy', 'Witty', 'Zesty', 'Snazzy',
  'Plucky', 'Spunky', 'Perky', 'Wacky', 'Nifty', 'Groovy', 'Swanky', 'Dandy',
  'Fizzy', 'Jazzy', 'Stormy', 'Sunny', 'Frosty', 'Toasty', 'Crispy', 'Fluffy',
  'Silky', 'Velvet', 'Golden', 'Silver', 'Rusty', 'Sandy', 'Misty', 'Dusty',
  'Lucky', 'Dizzy', 'Loopy', 'Salty', 'Tangy', 'Spicy', 'Minty', 'Maple',
  'Coral', 'Azure', 'Amber', 'Ivory', 'Jade', 'Ruby', 'Pearl', 'Onyx',
  'Pixel', 'Turbo', 'Mega', 'Ultra', 'Hyper', 'Super', 'Micro', 'Nano',
  'Rapid', 'Swift', 'Sleek', 'Bold', 'Brave', 'Noble', 'Vivid', 'Atomic',
] as const;

const animals = [
  'Penguin', 'Otter', 'Raccoon', 'Axolotl', 'Panda', 'Koala', 'Capybara', 'Alpaca',
  'Hedgehog', 'Flamingo', 'Narwhal', 'Quokka', 'Sloth', 'Fox', 'Owl', 'Lynx',
  'Dolphin', 'Octopus', 'Mantis', 'Gecko', 'Parrot', 'Toucan', 'Pelican', 'Kiwi',
  'Badger', 'Beaver', 'Ferret', 'Chinchilla', 'Hamster', 'Meerkat', 'Lemur', 'Puffin',
  'Ibis', 'Crane', 'Heron', 'Osprey', 'Falcon', 'Hawk', 'Robin', 'Wren',
  'Coyote', 'Jackal', 'Moose', 'Bison', 'Gazelle', 'Impala', 'Oryx', 'Tapir',
  'Pangolin', 'Ocelot', 'Margay', 'Serval', 'Pika', 'Vole', 'Shrew', 'Newt',
  'Gecko', 'Iguana', 'Chameleon', 'Tortoise', 'Starfish', 'Seahorse', 'Jellyfish', 'Squid',
  'Lobster', 'Crab', 'Urchin', 'Clam', 'Snail', 'Moth', 'Cricket', 'Firefly',
  'Bunny', 'Kitten', 'Puppy', 'Duckling', 'Fawn', 'Cub', 'Piglet', 'Lamb',
] as const;

export function generateName(): string {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj} ${animal}`;
}

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
