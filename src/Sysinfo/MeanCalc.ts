
class MeanCalc {
    metrics: any[];
    count: number;

    constructor(count) {
        this.metrics = []
        this.count = count
    }

    inspect() {
        return this.val()
    }

    add(value) {
        if (this.metrics.length >= this.count) {
            this.metrics.shift()
        }
        this.metrics.push(value)
    }

    val() {
        if (this.metrics.length == 0) return 0
        let sum = this.metrics.reduce((prev, curr) => curr += prev)
        return Math.floor((sum / this.metrics.length) * 1000) / 1000
    }
}

export default MeanCalc
