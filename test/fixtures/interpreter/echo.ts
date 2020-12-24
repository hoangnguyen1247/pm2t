
class Greeter {
    greeting: string;
    constructor(greeting: string) { 
        this.greeting = greeting;
    }
    greet() {
        return this.greeting;
    }
}

const greeter = new Greeter("Hello Typescript!");

console.log(greeter.greet());
